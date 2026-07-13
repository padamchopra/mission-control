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
    @State private var actionError: String?
    @State private var path: [String] = []
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var store: ServerStore

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    // body is split into layers (chrome → dialogs → lifecycle) because one flat
    // modifier chain exceeds the type-checker's budget.
    var body: some View {
        NavigationStack(path: $path) {
            dialogsLayer
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
            .alert("Something went wrong", isPresented: errorPresented) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(actionError ?? "")
            }
            .alert("Remove worktree?", isPresented: cleanupPresented, presenting: pendingCleanup) { info in
                Button("Remove", role: .destructive) {
                    if let path = info.path {
                        Task { try? await api?.removeWorktree(path: path, force: info.dirty == true) }
                    }
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
            SessionRow(session: session, isKilling: killing.contains(session.name)) { key in
                quickReply(session, key: key)
            }
        }
        .disabled(killing.contains(session.name))
        .contextMenu {
            Button {
                renameText = session.name
                renameTarget = session
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            Button(role: .destructive) {
                pendingKill = session
            } label: {
                Label("Kill session", systemImage: "xmark.octagon")
            }
        }
    }

    private func workspaceHeader(_ workspace: Workspace) -> some View {
        HStack {
            Text(workspace.name)
            Spacer()
            Button {
                Task { await openSession(in: workspace) }
            } label: {
                Image(systemName: "plus.circle")
            }
            .buttonStyle(.plain)
        }
        .textCase(nil)
        .contextMenu {
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

    // A session belongs to the most specific workspace whose path contains its
    // current directory.
    private func workspaceId(for session: TmuxSession) -> String? {
        workspaces
            .filter { session.panePath == $0.path || session.panePath.hasPrefix($0.path + "/") }
            .max(by: { $0.path.count < $1.path.count })?
            .id
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
        if info.dirty == true { parts.append("It has uncommitted changes that will be discarded.") }
        return parts.joined(separator: " ")
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
            sessions = try await sessionsCall.sorted(by: triageOrder)
            workspaces = (try? await workspacesCall) ?? workspaces
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
        hasLoaded = true
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

    private func quickReply(_ session: TmuxSession, key: String) {
        Task { try? await api?.sendKeys(session.name, keys: [key]) }
    }

    private func kill(_ session: TmuxSession) async {
        guard let api else { return }
        killing.insert(session.name)
        defer { killing.remove(session.name) }
        do {
            let worktree = try? await api.worktree(session.name)
            try await api.kill(session.name)
            sessions.removeAll { $0.name == session.name }
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
    var onQuickReply: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
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
            if session.resolvedState == .needsInput {
                if let detail = session.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .lineLimit(2)
                }
                quickReplies
            }
        }
        .padding(.vertical, 2)
    }

    private var quickReplies: some View {
        HStack(spacing: 6) {
            ForEach(["1", "2", "3"], id: \.self) { key in
                Button {
                    onQuickReply(key)
                } label: {
                    Text(key)
                        .font(.caption.weight(.semibold).monospaced())
                        .frame(width: 30, height: 26)
                        .background(Color.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 7))
                        .foregroundStyle(.orange)
                }
                .buttonStyle(.plain)
            }
            Text("quick reply")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 2)
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
