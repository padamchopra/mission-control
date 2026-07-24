import SwiftUI

struct SessionListView: View {
    @AppStorage("serverURL") private var serverURL = "http://127.0.0.1:8420"
    @AppStorage("serverToken") private var serverToken = ""
    @State private var sessions: [TmuxSession] = []
    @State private var workspaces: [Workspace] = []
    @State private var hasLoaded = false
    @State private var loadError: String?
    @State private var showServers = false
    @State private var pendingKill: TmuxSession?
    @State private var pendingCleanup: WorktreeInfo?
    @State private var killing: Set<String> = []
    @State private var renameTarget: TmuxSession?
    @State private var renameText = ""
    @State private var workspaceTarget: TmuxSession?
    @State private var workspaceName = ""
    @State private var workspacePath = ""
    @State private var workspaceRepositoryTarget: Workspace?
    @State private var activityTarget: TmuxSession?
    @State private var actionError: String?
    @State private var path: [String] = []
    // NavigationStack exposes the current path but not browser-like history.
    // Keep snapshots so Command-[ / Command-] can traverse where the user has
    // actually been, including sessions opened from notifications and links.
    @State private var navigationHistory: [[String]] = [[]]
    @State private var historyIndex = 0
    @State private var restoringHistory = false
    #if targetEnvironment(macCatalyst)
    // A Mac is an operational surface, not a compact navigation flow. Keep the
    // queue visible beside the terminal unless the user explicitly hides it.
    @State private var desktopColumnVisibility: NavigationSplitViewVisibility = .all
    #endif
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var store: ServerStore
    @Environment(\.openURL) private var openURL

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    // body is split into layers (chrome → dialogs → lifecycle) because one flat
    // modifier chain exceeds the type-checker's budget.
    var body: some View {
        Group {
            #if targetEnvironment(macCatalyst)
            desktopNavigation
            #else
            NavigationStack(path: $path) { dialogsLayer }
            #endif
        }
        .task(id: serverURL + serverToken) {
            await autoRefresh()
        }
        .onOpenURL { url in
            if let config = PairingConfig(from: url) {
                store.addOrUpdate(url: config.url, token: config.token)
            } else if url.host == "session", let name = url.pathComponents.dropFirst().first {
                path = [name]
            }
        }
        .onChange(of: router.openSession) { _, session in
            guard let session else { return }
            path = [session]
            router.openSession = nil
        }
        .onChange(of: router.sessionDeletion) { _, deletion in
            guard let deletion else { return }
            removeSessionAndAdvance(from: sessions, removing: deletion.name)
            if let worktree = deletion.worktree, worktree.isWorktree {
                pendingCleanup = worktree
            }
            router.clearSessionDeletion()
        }
        .onChange(of: router.historyRequest) { _, request in
            guard let request else { return }
            switch request.action {
            case .back:
                restoreHistory(at: historyIndex - 1)
            case .forward:
                restoreHistory(at: historyIndex + 1)
            }
        }
        #if targetEnvironment(macCatalyst)
        .onChange(of: router.sidebarToggleRequest) { _, _ in
            toggleDesktopSidebar()
        }
        #endif
        .onChange(of: path) { _, newPath in
            recordNavigation(newPath)
        }
        .sheet(isPresented: $router.isCommandPalettePresented) {
            SessionCommandPalette(
                sessions: sessions,
                onOpen: { name in
                    path = [name]
                    router.isCommandPalettePresented = false
                },
                onManageServers: {
                    router.isCommandPalettePresented = false
                    showServers = true
                }
            )
        }
        .overlay(alignment: .bottomTrailing) {
            ToastOverlay()
                .padding(20)
        }
        .sheet(item: $activityTarget) { session in
            SessionActivitySheet(sessionName: session.name, serverURL: serverURL, token: serverToken)
        }
        .sheet(item: $workspaceRepositoryTarget) { workspace in
            WorkspaceRepositorySheet(
                workspace: workspace,
                sessions: sessions,
                api: api,
                onChanged: { await load() }
            )
        }
    }

    #if targetEnvironment(macCatalyst)
    private var desktopNavigation: some View {
        NavigationSplitView(columnVisibility: $desktopColumnVisibility) {
            desktopSidebar
                .toolbar(.hidden, for: .navigationBar)
                .navigationSplitViewColumnWidth(min: 280, ideal: 340, max: 420)
        } detail: {
            if let name = path.last {
                TerminalScreen(sessionName: name)
                    // The detail screen supplies its own navigation title on
                    // compact devices. On Catalyst, keep one app-level title
                    // in the principal toolbar position so it is centred in
                    // the window rather than in whichever column is active.
                    .navigationTitle("")
                    // TerminalContainer owns a WebSocket coordinator. Give a
                    // selected session a new identity so changing rows tears
                    // down the old stream and attaches the new terminal.
                    .id(name)
            } else {
                ContentUnavailableView(
                    "Select a session",
                    systemImage: "rectangle.and.text.magnifyingglass",
                    description: Text("Choose a session from the sidebar or press Command-K.")
                )
            }
        }
        .navigationSplitViewStyle(.balanced)
        // `ToolbarItem(placement: .principal)` is centred in Catalyst's detail
        // region, not the window. Draw this title across the full split view
        // and lift it into the title-bar row after hiding the native title.
        .overlay(alignment: .top) {
            Text("Mission Control")
                .font(.headline.weight(.semibold))
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                // NavigationSplitView begins below Catalyst's title-bar row.
                // Raise the title into that row, while retaining enough inset
                // that it does not visually collide with the window border.
                .offset(y: -24)
                .accessibilityAddTraits(.isHeader)
                .allowsHitTesting(false)
        }
        .sheet(isPresented: $showServers) { ServersView() }
    }

    private func toggleDesktopSidebar() {
        withAnimation {
            desktopColumnVisibility = desktopColumnVisibility == .detailOnly ? .all : .detailOnly
        }
    }

    private var desktopSidebarToggle: some View {
        Button(action: toggleDesktopSidebar) {
            Image(systemName: "sidebar.leading")
                .font(.body.weight(.medium))
                .frame(width: 32, height: 32)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hide sidebar")
        .help("Hide sidebar")
    }

    @ViewBuilder
    private var desktopSidebar: some View {
        VStack(spacing: 0) {
            desktopSidebarHeader
            if store.servers.isEmpty {
                VStack(spacing: 18) {
                    ContentUnavailableView {
                        Label("No servers", systemImage: "server.rack")
                    } description: {
                        Text("Add a connection to view and control your sessions.")
                    }

                    Button {
                        showServers = true
                    } label: {
                        Label("Add connection", systemImage: "plus")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.horizontal, 22)
                    .padding(.bottom, 24)
                }
                .frame(maxHeight: .infinity)
            } else {
                desktopSessionList
            }
        }
    }

    private var desktopSidebarHeader: some View {
        HStack(alignment: .center, spacing: 10) {
            desktopSidebarToggle
            VStack(alignment: .leading, spacing: 6) {
                Text("Mission Control")
                    .font(.title2.weight(.bold))
                if store.servers.count > 1 || store.active != nil {
                    serverSwitcher
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button { showServers = true } label: {
                Image(systemName: "gearshape")
                    .font(.body.weight(.semibold))
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .liquidGlass(in: Circle())
            .accessibilityLabel("Server settings")
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
    }

    private var desktopSessionList: some View {
        List {
            ForEach(workspaces) { workspace in
                Section {
                    ForEach(sessionsFor(workspace)) { session in
                        desktopSessionRow(session)
                    }
                } header: {
                    workspaceHeader(workspace)
                }
            }
            let ungrouped = ungroupedSessions()
            if !ungrouped.isEmpty {
                Section(workspaces.isEmpty ? "" : "Other") {
                    ForEach(ungrouped) { session in
                        desktopSessionRow(session)
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }

    private func desktopSessionRow(_ session: TmuxSession) -> some View {
        Button {
            path = [session.name]
        } label: {
            SessionRow(session: session, isKilling: killing.contains(session.name))
        }
        .buttonStyle(.plain)
        .listRowBackground(
            session.name == path.last ? Color.accentColor.opacity(0.2) : Color.clear
        )
        .contextMenu { sessionContextMenu(session) }
    }
    #endif

    private func recordNavigation(_ newPath: [String]) {
        guard !restoringHistory, navigationHistory[historyIndex] != newPath else { return }
        navigationHistory = Array(navigationHistory.prefix(historyIndex + 1))
        navigationHistory.append(newPath)
        historyIndex += 1
    }

    private func restoreHistory(at index: Int) {
        guard navigationHistory.indices.contains(index), index != historyIndex else { return }
        historyIndex = index
        restoringHistory = true
        path = navigationHistory[index]
        // Reset after the bound NavigationStack has observed the restored path.
        DispatchQueue.main.async {
            restoringHistory = false
        }
    }

    private var chromeLayer: some View {
        content
            .navigationTitle("Mission Control")
            .toolbar {
                if store.servers.count > 1 || store.active != nil {
                    ToolbarItem(placement: .topBarLeading) { serverSwitcher }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showServers = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .navigationDestination(for: String.self) { name in
                TerminalScreen(sessionName: name)
            }
            .sheet(isPresented: $showServers) {
                ServersView()
            }
    }

    private var dialogsLayer: some View {
        chromeLayer
            .confirmationDialog(
                "Kill session?",
                isPresented: killPresented,
                presenting: pendingKill
            ) { session in
                Button("Kill \(session.name)", role: .destructive) {
                    Task { await kill(session) }
                }
            } message: { session in
                Text("This kills the tmux session and everything running in it (\(session.name)).")
            }
            .alert("Rename session", isPresented: renamePresented, presenting: renameTarget) { session in
                TextField("Name", text: $renameText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Rename") {
                    Task { await rename(session, to: renameText) }
                }
                Button("Cancel", role: .cancel) {}
            }
            .alert("Save repository as workspace", isPresented: workspacePresented, presenting: workspaceTarget) { session in
                TextField("Name", text: $workspaceName)
                    .textInputAutocapitalization(.never)
                TextField("Path", text: $workspacePath)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Save") {
                    let name = workspaceName
                    let path = workspacePath
                    Task {
                        do {
                            try await api?.saveWorkspace(fromSession: session.name, name: name, path: path)
                        } catch {
                            actionError = "Couldn't save workspace. Check that the path exists on the server."
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text("The selected path must be inside a Git repository. Mission Control saves its primary checkout and discovers all linked worktrees.")
            }
            .alert("Something went wrong", isPresented: errorPresented) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(actionError ?? "")
            }
            .alert("Remove worktree?", isPresented: cleanupPresented, presenting: pendingCleanup) { info in
                if info.dirty != true {
                    Button("Remove cleanly") {
                        Task { await removeWorktreeAfterSession(info, force: false) }
                    }
                }
                Button("Force remove", role: .destructive) {
                    Task { await removeWorktreeAfterSession(info, force: true) }
                }
                Button("Keep", role: .cancel) {}
            } message: { info in
                Text(cleanupMessage(info))
            }
    }

    private var killPresented: Binding<Bool> {
        Binding(get: { pendingKill != nil }, set: { if !$0 { pendingKill = nil } })
    }

    private var renamePresented: Binding<Bool> {
        Binding(get: { renameTarget != nil }, set: { if !$0 { renameTarget = nil } })
    }

    private var workspacePresented: Binding<Bool> {
        Binding(get: { workspaceTarget != nil }, set: { if !$0 { workspaceTarget = nil } })
    }

    private var errorPresented: Binding<Bool> {
        Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })
    }

    private var cleanupPresented: Binding<Bool> {
        Binding(get: { pendingCleanup != nil }, set: { if !$0 { pendingCleanup = nil } })
    }

    private var serverSwitcher: some View {
        Menu {
            ForEach(store.servers) { server in
                Button {
                    store.activeID = server.id
                } label: {
                    Label(server.name, systemImage: server.id == store.activeID ? "checkmark" : "server.rack")
                }
            }
            Divider()
            Button {
                showServers = true
            } label: {
                Label("Manage servers", systemImage: "gearshape")
            }
        } label: {
            HStack(spacing: 4) {
                Text(store.active?.name ?? "Servers")
                Image(systemName: "chevron.down").font(.caption2)
            }
            .font(.subheadline.weight(.semibold))
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.servers.isEmpty {
            ContentUnavailableView {
                Label("No servers", systemImage: "server.rack")
            } description: {
                Text("Add a server by scanning the pairing QR your Mac's setup script prints.")
            } actions: {
                Button("Add server") { showServers = true }
                    .buttonStyle(.borderedProminent)
            }
        } else if let loadError, sessions.isEmpty {
            ContentUnavailableView(
                "Can't reach server",
                systemImage: "wifi.slash",
                description: Text(loadError)
            )
        } else if sessions.isEmpty && hasLoaded {
            ContentUnavailableView(
                "No active sessions",
                systemImage: "moon.zzz",
                description: Text("Nothing is running in tmux on this server right now.")
            )
        } else {
            sessionList
        }
    }

    private var sessionList: some View {
        List {
            ForEach(workspaces) { workspace in
                Section {
                    ForEach(sessionsFor(workspace)) { session in
                        sessionLink(session)
                    }
                } header: {
                    workspaceHeader(workspace)
                }
            }
            let ungrouped = ungroupedSessions()
            if !ungrouped.isEmpty {
                Section(workspaces.isEmpty ? "" : "Other") {
                    ForEach(ungrouped) { session in
                        sessionLink(session)
                    }
                }
            }
        }
        .refreshable { await load() }
    }

    private func sessionLink(_ session: TmuxSession) -> some View {
        NavigationLink(value: session.name) {
            SessionRow(session: session, isKilling: killing.contains(session.name))
        }
        .disabled(killing.contains(session.name))
        .contextMenu {
            sessionContextMenu(session)
        }
    }

    @ViewBuilder
    private func sessionContextMenu(_ session: TmuxSession) -> some View {
        Button {
            Task {
                guard let api,
                      let links = try? await api.links(session.name, includePullRequest: false),
                      let url = links.claudeUrl.flatMap(URL.init) else { return }
                openURL(url)
            }
        } label: {
            Label("Open in claude.ai", systemImage: "arrow.up.forward.app")
        }
        Button {
            renameText = session.name
            renameTarget = session
        } label: {
            Label("Rename session", systemImage: "pencil")
        }
        Button {
            workspaceName = session.name
            workspacePath = ""
            Task {
                workspacePath = (try? await api?.cwd(session.name)) ?? ""
                workspaceTarget = session
            }
        } label: {
            Label("Save repository as workspace", systemImage: "folder.badge.plus")
        }
        notificationToggle(session)
        Button {
            activityTarget = session
        } label: {
            Label("View activity", systemImage: "clock.arrow.circlepath")
        }
        Button {
            path = [session.name]
            router.showTerminalSearch(in: session.name)
        } label: {
            Label("Find in terminal", systemImage: "magnifyingglass")
        }
        .keyboardShortcut("f", modifiers: .command)
        Divider()
        Button(role: .destructive) {
            pendingKill = session
        } label: {
            Label("Kill session", systemImage: "xmark.octagon")
        }
    }

    @ViewBuilder
    private func notificationToggle(_ session: TmuxSession) -> some View {
        Button {
            Task {
                try? await api?.setNotificationsMuted(session.name, muted: !(session.notificationsMuted ?? false))
                await load()
            }
        } label: {
            Label(
                session.notificationsMuted == true ? "Subscribe to notifications" : "Unsubscribe from notifications",
                systemImage: session.notificationsMuted == true ? "bell" : "bell.slash"
            )
        }
    }

    private func workspaceHeader(_ workspace: Workspace) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(workspace.name)
                Text("\(workspace.worktrees.count) \(workspace.worktrees.count == 1 ? "checkout" : "checkouts")")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                workspaceRepositoryTarget = workspace
            } label: {
                Image(systemName: "rectangle.3.group")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Manage repository worktrees")
            Button {
                Task { await openSession(in: workspace) }
            } label: {
                Image(systemName: "plus.circle")
            }
            .buttonStyle(.plain)
        }
        .textCase(nil)
        .contextMenu {
            Button {
                workspaceRepositoryTarget = workspace
            } label: {
                Label("Manage worktrees", systemImage: "rectangle.3.group")
            }
            Button(role: .destructive) {
                Task { try? await api?.removeWorkspace(id: workspace.id); await load() }
            } label: {
                Label("Remove workspace", systemImage: "trash")
            }
        }
    }

    private func sessionsFor(_ workspace: Workspace) -> [TmuxSession] {
        sessions.filter { workspaceId(for: $0) == workspace.id }.sorted(by: triageOrder)
    }

    private func ungroupedSessions() -> [TmuxSession] {
        sessions.filter { workspaceId(for: $0) == nil }.sorted(by: triageOrder)
    }

    // A session belongs to the workspace whose primary checkout or linked
    // worktree most specifically contains its current directory.
    private func workspaceId(for session: TmuxSession) -> String? {
        workspaces
            .compactMap { workspace -> (workspace: Workspace, length: Int)? in
                let matchingPath = workspace.worktrees
                    .map(\.path)
                    .filter { session.panePath == $0 || session.panePath.hasPrefix($0 + "/") }
                    .max(by: { $0.count < $1.count })
                guard let matchingPath else { return nil }
                return (workspace, matchingPath.count)
            }
            .max(by: { $0.length < $1.length })?
            .workspace.id
    }

    private func openSession(in workspace: Workspace) async {
        guard let api else { return }
        do {
            let name = try await api.openSessionInWorkspace(id: workspace.id)
            await load()
            if !name.isEmpty { path = [name] }
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func cleanupMessage(_ info: WorktreeInfo) -> String {
        var parts = ["Session killed."]
        if let branch = info.branch { parts.append("Remove its git worktree? Branch \(branch) is kept.") }
        if info.dirty == true { parts.append("It has uncommitted changes. Force remove will discard them.") }
        return parts.joined(separator: " ")
    }

    private func removeWorktreeAfterSession(_ info: WorktreeInfo, force: Bool) async {
        guard let path = info.path else { return }
        do {
            try await api?.removeWorktree(path: path, force: force)
            await load()
        } catch {
            actionError = force
                ? "Couldn't force-remove the worktree."
                : "Couldn't remove cleanly. Check for uncommitted changes."
        }
    }

    private func autoRefresh() async {
        while !Task.isCancelled {
            await load()
            try? await Task.sleep(for: .seconds(5))
        }
    }

    private func load() async {
        guard let api else { return }
        do {
            async let sessionsCall = api.sessions()
            async let workspacesCall = api.workspaces()
            let fetchedSessions = try await sessionsCall.sorted(by: triageOrder)
            let previousSessions = sessions
            sessions = fetchedSessions
            reconcileSelectedSession(previousSessions: previousSessions)
            workspaces = (try? await workspacesCall) ?? workspaces
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
        hasLoaded = true
    }

    private func reconcileSelectedSession(previousSessions: [TmuxSession]) {
        guard let selected = path.last,
              !sessions.contains(where: { $0.name == selected }) else { return }
        removeSessionAndAdvance(from: previousSessions, removing: selected)
    }

    private func removeSessionAndAdvance(from previousSessions: [TmuxSession], removing name: String) {
        let removedIndex = previousSessions.firstIndex { $0.name == name }
        sessions.removeAll { $0.name == name }

        guard path.last == name else { return }
        let nextIndex = min(removedIndex ?? 0, max(sessions.count - 1, 0))
        path = sessions.indices.contains(nextIndex) ? [sessions[nextIndex].name] : []
    }

    // Sessions waiting on the human float to the top, then busy, then quiet.
    private func triageOrder(_ a: TmuxSession, _ b: TmuxSession) -> Bool {
        func rank(_ s: TmuxSession) -> Int {
            switch s.resolvedState {
            case .needsInput: return 0
            case .working: return 1
            case .idle: return 2
            case .unknown: return 3
            }
        }
        return rank(a) != rank(b) ? rank(a) < rank(b) : a.lastOutputAt > b.lastOutputAt
    }

    private func kill(_ session: TmuxSession) async {
        guard let api else { return }
        killing.insert(session.name)
        defer { killing.remove(session.name) }
        do {
            let worktree = try? await api.worktree(session.name)
            try await api.kill(session.name)
            removeSessionAndAdvance(from: sessions, removing: session.name)
            if let worktree, worktree.isWorktree {
                pendingCleanup = worktree
            }
        } catch {
            actionError = "Couldn't kill \(session.name): \(error.localizedDescription)"
        }
    }

    private func rename(_ session: TmuxSession, to newName: String) async {
        guard let api else { return }
        let trimmed = newName.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: " ", with: "-")
        guard !trimmed.isEmpty, trimmed != session.name else { return }
        do {
            try await api.rename(session.name, to: trimmed)
            await load()
        } catch {
            actionError = "Couldn't rename. Use letters, digits, dashes or underscores."
        }
    }
}

private struct SessionRow: View {
    let session: TmuxSession
    var isKilling = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(session.name)
                    .font(.headline)
                Spacer()
                if isKilling {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    stateChip
                }
            }
            Text("\(session.paneCommand) · \(session.lastOutputDate.formatted(.relative(presentation: .named)))")
                .font(.caption)
                .foregroundStyle(.secondary)
            if let preview = session.preview, !preview.isEmpty {
                Text(preview)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if session.resolvedState == .needsInput {
                if let detail = session.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .lineLimit(2)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var stateChip: some View {
        let (label, color) = chipStyle
        return Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }

    private var chipStyle: (String, Color) {
        switch session.resolvedState {
        case .working: return ("Working", .blue)
        case .needsInput: return ("Needs input", .orange)
        case .idle: return ("Idle", .green)
        case .unknown: return ("Unknown", .gray)
        }
    }
}
