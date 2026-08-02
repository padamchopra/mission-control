import SwiftTerm
import SwiftUI
import UIKit

// SwiftTerm also exports a `Color`; pin the bare name to SwiftUI's in this file.
private typealias Color = SwiftUI.Color

private enum SessionMode { case conversation, terminal }

struct FlightDeckSessionPresentation {
    let agent: AgentKind
    let state: SessionState
    let panePath: String
    let paneCommand: String
    let currentAction: String?
    let context: ContextUsage?
}

struct TerminalScreen: View {
    let sessionName: String
    var flightPresentation: FlightDeckSessionPresentation?

    @AppStorage("serverURL") private var serverURL = "http://127.0.0.1:8420"
    @AppStorage("serverToken") private var serverToken = ""
    @AppStorage("terminalFontSize") private var fontSize = 13.0
    @State private var streamState: StreamState = .connecting
    @State private var inCopyMode = false
    @State private var coordinator: TerminalContainer.Coordinator?
    @State private var links: SessionLinks?
    @State private var isCheckingPullRequest = false
    @State private var showSaveWorkspace = false
    @State private var workspaceName = ""
    @State private var workspacePath = ""
    @State private var showRename = false
    @State private var renameText = ""
    @State private var isKilling = false
    @State private var showKillConfirmation = false
    @State private var isArchiving = false
    @State private var showArchiveConfirmation = false
    @State private var actionError: String?
    @State private var notificationsMuted = false
    @State private var showActivity = false
    @State private var showSearch = false
    @State private var showPullRequest = false
    @State private var mode: SessionMode
    // Fetched once and then kept current by the push channel, so the composer
    // knows whether Claude will queue a message in either view mode.
    @State private var sessionState: SessionState?
    @State private var agent: AgentKind?
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toasts: ToastCenter
    @Environment(\.openURL) private var openURL

    init(sessionName: String, flightPresentation: FlightDeckSessionPresentation? = nil) {
        self.sessionName = sessionName
        self.flightPresentation = flightPresentation
        _mode = State(initialValue: flightPresentation?.agent == .shell ? .terminal : .conversation)
        _sessionState = State(initialValue: flightPresentation?.state)
        _agent = State(initialValue: flightPresentation?.agent)
    }

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    var body: some View {
        content
        #if targetEnvironment(macCatalyst)
            .background(FlightDeckPalette.background)
        #else
            .background(Color.black)
        #endif
        .navigationTitle(sessionName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                pullRequestButton
                if isKilling {
                    ProgressView()
                } else {
                    sessionMenu
                }
            }
        }
        .task(id: streamState) { await pollCopyMode() }
        .task { await loadClaudeLink() }
        .task { await loadNotificationPreference() }
        .task {
            let response = try? await api?.sessionState(sessionName)
            sessionState = response?.state
            agent = response?.agent
        }
        .task { presentRequestedSearchIfNeeded() }
        .onReceive(PushChannel.shared.sessionUpdates) { push in
            guard push.serverURL == serverURL, push.session == sessionName else { return }
            if let pushedAgent = push.agent { agent = pushedAgent }
            sessionState = push.state
        }
        .onChange(of: router.terminalSearchSession) { _, _ in
            presentRequestedSearchIfNeeded()
        }
        #if targetEnvironment(macCatalyst)
        .overlay { flightDeckModal }
        #else
        .sheet(isPresented: $showActivity) {
            SessionActivitySheet(sessionName: sessionName, serverURL: serverURL, token: serverToken)
        }
        .sheet(isPresented: $showSearch) {
            TerminalSearchSheet(sessionName: sessionName, serverURL: serverURL, token: serverToken)
        }
        .sheet(isPresented: $showPullRequest) {
            PullRequestSheet(sessionName: sessionName, api: api)
        }
        .alert("Save repository as workspace", isPresented: $showSaveWorkspace) {
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
                        try await api?.saveWorkspace(fromSession: sessionName, name: name, path: path)
                    } catch {
                        actionError = error.localizedDescription
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The path must be inside a Git repository. Mission Control saves its primary checkout and discovers linked worktrees.")
        }
        .alert("Rename session", isPresented: $showRename) {
            TextField("Name", text: $renameText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Rename") { rename() }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Something went wrong", isPresented: errorPresented) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionError ?? "")
        }
        .confirmationDialog("Kill session?", isPresented: $showKillConfirmation) {
            Button("Kill \(sessionName)", role: .destructive) {
                Task { await killWithCleanup() }
            }
        } message: {
            Text("This kills the tmux session and everything running in it (\(sessionName)).")
        }
        .confirmationDialog("Archive conversation?", isPresented: $showArchiveConfirmation) {
            Button("Archive \(sessionName)") {
                Task { await archiveConversation() }
            }
        } message: {
            Text("This saves the conversation in Archived chats and closes the live session. The repository and worktrees stay untouched.")
        }
        #endif
    }

    #if targetEnvironment(macCatalyst)
    @ViewBuilder
    private var flightDeckModal: some View {
        if showActivity {
            FlightDeckModalLayer(onDismiss: { showActivity = false }) {
                SessionActivitySheet(
                    sessionName: sessionName,
                    serverURL: serverURL,
                    token: serverToken,
                    onClose: { showActivity = false }
                )
                .frame(width: 760, height: 620)
            }
        } else if showSearch {
            FlightDeckModalLayer(onDismiss: { showSearch = false }) {
                TerminalSearchSheet(
                    sessionName: sessionName,
                    serverURL: serverURL,
                    token: serverToken,
                    onClose: { showSearch = false }
                )
                .frame(width: 760, height: 620)
            }
        } else if showPullRequest {
            FlightDeckModalLayer(onDismiss: { showPullRequest = false }) {
                PullRequestSheet(
                    sessionName: sessionName,
                    api: api,
                    onClose: { showPullRequest = false }
                )
                .frame(width: 760, height: 660)
            }
        } else if showSaveWorkspace {
            FlightDeckModalLayer(onDismiss: { showSaveWorkspace = false }) {
                FlightDeckDialogModal(
                    eyebrow: "SESSION / SAVE WORKSPACE",
                    title: "Save repository as workspace",
                    message: "The path must be inside a Git repository. Mission Control saves its primary checkout and discovers linked worktrees."
                ) {
                    VStack(spacing: 12) {
                        TextField("Workspace name", text: $workspaceName)
                            .textFieldStyle(FlightDeckTextFieldStyle())
                            .textInputAutocapitalization(.never)
                        TextField("Repository path", text: $workspacePath)
                            .textFieldStyle(FlightDeckTextFieldStyle())
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                } actions: {
                    Button("CANCEL") { showSaveWorkspace = false }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                    Button("SAVE WORKSPACE") {
                        showSaveWorkspace = false
                        saveWorkspace()
                    }
                    .buttonStyle(FlightDeckAccentButtonStyle())
                }
            }
        } else if showRename {
            FlightDeckModalLayer(onDismiss: { showRename = false }) {
                FlightDeckDialogModal(
                    eyebrow: "SESSION / IDENTIFIER",
                    title: "Rename session",
                    message: "Choose a short name that is easy to scan in Command Center."
                ) {
                    TextField("Session name", text: $renameText)
                        .textFieldStyle(FlightDeckTextFieldStyle())
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } actions: {
                    Button("CANCEL") { showRename = false }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                    Button("RENAME") {
                        showRename = false
                        rename()
                    }
                    .buttonStyle(FlightDeckAccentButtonStyle())
                }
            }
        } else if let actionError {
            FlightDeckModalLayer(onDismiss: { self.actionError = nil }) {
                FlightDeckDialogModal(
                    eyebrow: "SESSION / OPERATION FAILED",
                    title: "Something went wrong",
                    message: actionError
                ) {
                    EmptyView()
                } actions: {
                    Button("OK") { self.actionError = nil }
                        .buttonStyle(FlightDeckAccentButtonStyle())
                }
            }
        } else if showKillConfirmation {
            FlightDeckModalLayer(onDismiss: { showKillConfirmation = false }) {
                FlightDeckDialogModal(
                    eyebrow: "SESSION / DESTRUCTIVE ACTION",
                    title: "Kill session?",
                    message: "This kills the tmux session and everything running in it (\(sessionName))."
                ) {
                    EmptyView()
                } actions: {
                    Button("CANCEL") { showKillConfirmation = false }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                    Button("KILL \(sessionName.uppercased())") {
                        showKillConfirmation = false
                        Task { await killWithCleanup() }
                    }
                    .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.red))
                }
            }
        } else if showArchiveConfirmation {
            FlightDeckModalLayer(onDismiss: { showArchiveConfirmation = false }) {
                FlightDeckDialogModal(
                    eyebrow: "SESSION / ARCHIVE",
                    title: "Archive conversation?",
                    message: "This saves the conversation in Archived chats and closes the live session. The repository and worktrees stay untouched."
                ) {
                    EmptyView()
                } actions: {
                    Button("CANCEL") { showArchiveConfirmation = false }
                        .buttonStyle(FlightDeckOutlineButtonStyle(color: FlightDeckPalette.secondary))
                    Button("ARCHIVE \(sessionName.uppercased())") {
                        showArchiveConfirmation = false
                        Task { await archiveConversation() }
                    }
                    .buttonStyle(FlightDeckAccentButtonStyle())
                }
            }
        }
    }
    #endif

    @ViewBuilder
    private var content: some View {
        mainColumn
    }

    private var mainColumn: some View {
        VStack(spacing: 0) {
            #if targetEnvironment(macCatalyst)
            flightSessionHeader
            if mode == .terminal { flightContextStrip }
            #endif
            if mode == .terminal { connectionBanner }
            #if !targetEnvironment(macCatalyst)
            modeBar
            #endif
            switch mode {
            case .terminal:
                terminalContent
            case .conversation:
                ConversationView(
                    sessionName: sessionName,
                    serverURL: serverURL,
                    token: serverToken,
                    onShowTerminal: { mode = .terminal }
                )
            }
            if mode == .conversation {
                MessageComposer(sessionName: sessionName, sessionState: sessionState, agent: agent)
            }
        }
    }

    #if targetEnvironment(macCatalyst)
    private var flightSessionHeader: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 10) {
                    Text(sessionName)
                        .font(.flightSans(16, weight: .bold))
                        .foregroundStyle(FlightDeckPalette.text)
                        .lineLimit(1)
                    Text(flightStateLabel)
                        .font(.flightMono(7, weight: .semibold))
                        .foregroundStyle(flightStateColor)
                        .lineLimit(1)
                }
                Text(flightMetadata)
                    .font(.flightMono(7))
                    .foregroundStyle(FlightDeckPalette.muted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            HStack(spacing: 0) {
                flightModeButton("CONVERSATION", .conversation)
                flightModeButton("TERMINAL", .terminal)
            }
            .overlay(Rectangle().stroke(FlightDeckPalette.border))

            sessionMenu
                .frame(width: 30, height: 30)
                .foregroundStyle(FlightDeckPalette.secondary)
                .overlay(Rectangle().stroke(FlightDeckPalette.border))
        }
        .padding(.horizontal, 24)
        .frame(height: 76)
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .bottom) { Divider().overlay(FlightDeckPalette.border) }
    }

    private var flightContextStrip: some View {
        HStack(spacing: 10) {
            Text(flightStripLead)
                .foregroundStyle(FlightDeckPalette.green)
            Text(flightStripDetail)
                .foregroundStyle(FlightDeckPalette.secondary)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(flightStripTrailing)
                .foregroundStyle(FlightDeckPalette.warm)
                .lineLimit(1)
        }
        .font(.flightMono(7))
        .padding(.horizontal, 24)
        .frame(height: 48)
        .background(FlightDeckPalette.raised.opacity(0.72))
        .overlay(alignment: .bottom) { Rectangle().fill(FlightDeckPalette.border).frame(height: 1) }
    }

    private var flightStateLabel: String {
        switch sessionState ?? flightPresentation?.state ?? .unknown {
        case .working: return "IN FLIGHT"
        case .needsInput: return "AWAITING COMMAND"
        case .idle: return "STANDING BY"
        case .unknown: return "LIVE"
        }
    }

    private var flightStateColor: Color {
        switch sessionState ?? flightPresentation?.state ?? .unknown {
        case .working, .idle: return FlightDeckPalette.green
        case .needsInput: return FlightDeckPalette.amber
        case .unknown: return FlightDeckPalette.warm
        }
    }

    private var flightMetadata: String {
        let path = flightPresentation?.panePath ?? "~"
        let location = URL(fileURLWithPath: path).lastPathComponent.uppercased()
        let kind = (agent ?? flightPresentation?.agent ?? .shell).displayName.uppercased()
        return "\(location.isEmpty ? "HOME" : location) / LIVE SESSION / \(kind)"
    }

    private var flightStripLead: String {
        let kind = agent ?? flightPresentation?.agent ?? .shell
        return kind == .shell ? "SHELL" : flightStateLabel
    }

    private var flightStripDetail: String {
        if let action = flightPresentation?.currentAction, !action.isEmpty { return action }
        if let path = flightPresentation?.panePath, !path.isEmpty { return path }
        return "Live session ready"
    }

    private var flightStripTrailing: String {
        if let context = flightPresentation?.context { return "\(context.percent)% CONTEXT" }
        return mode == .terminal ? "TERMINAL" : "CONVERSATION"
    }

    private func flightModeButton(_ title: String, _ target: SessionMode) -> some View {
        Button { mode = target } label: {
            Text(title)
                .font(.flightMono(7, weight: mode == target ? .bold : .medium))
                .foregroundStyle(mode == target ? FlightDeckPalette.amber : FlightDeckPalette.secondary)
                .padding(.horizontal, 10)
                .frame(height: 30)
                .background(mode == target ? FlightDeckPalette.raised : FlightDeckPalette.background)
        }
        .buttonStyle(.plain)
    }

    #endif

    private var modeBar: some View {
        Picker("View", selection: $mode) {
            Text("Conversation").tag(SessionMode.conversation)
            Text("Terminal").tag(SessionMode.terminal)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(Color.black)
    }

    // The live terminal plus its scroll affordance and quick-keys row. Mounted
    // only in terminal mode, so switching to Conversation tears the PTY down
    // (tmux holds the session, so switching back just re-attaches).
    @ViewBuilder
    private var terminalContent: some View {
        ZStack(alignment: .bottomTrailing) {
            TerminalContainer(
                sessionName: sessionName,
                serverURL: serverURL,
                token: serverToken,
                fontSize: fontSize,
                streamState: $streamState,
                inCopyMode: $inCopyMode,
                fontSizeStore: $fontSize,
                coordinator: $coordinator,
                openURL: openURL,
                onToast: { kind, message in toasts.show(kind, message) }
            )
            // On Mac Catalyst, this screen is the detail column of a split
            // view. Respect that column's bounds rather than expanding back
            // through the sidebar's horizontal safe area.
            #if !targetEnvironment(macCatalyst)
            .ignoresSafeArea(.container, edges: .horizontal)
            #endif
            jumpToBottomButton
        }
        quickKeysRow
    }

    private var sessionMenu: some View {
        Menu {
            if let claude = links?.claudeUrl.flatMap(URL.init) {
                Button {
                    openURL(claude)
                } label: {
                    Label("Open in claude.ai", systemImage: "arrow.up.forward.app")
                }
            }
            Button {
                showPullRequest = true
            } label: {
                Label("Pull request", systemImage: "arrow.triangle.pull")
            }
            Button {
                renameText = sessionName
                showRename = true
            } label: {
                Label("Rename session", systemImage: "pencil")
            }
            Button {
                workspaceName = sessionName
                workspacePath = ""
                Task {
                    workspacePath = (try? await api?.cwd(sessionName)) ?? ""
                    showSaveWorkspace = true
                }
            } label: {
                Label("Save repository as workspace", systemImage: "folder.badge.plus")
            }
            Button {
                Task { await toggleNotifications() }
            } label: {
                Label(
                    notificationsMuted ? "Subscribe to notifications" : "Unsubscribe from notifications",
                    systemImage: notificationsMuted ? "bell" : "bell.slash"
                )
            }
            #if !targetEnvironment(macCatalyst)
            Button {
                showActivity = true
            } label: {
                Label("View activity", systemImage: "clock.arrow.circlepath")
            }
            #endif
            Button {
                showSearch = true
            } label: {
                Label("Find in terminal", systemImage: "magnifyingglass")
            }
            .keyboardShortcut("f", modifiers: .command)
            Divider()
            Button {
                showArchiveConfirmation = true
            } label: {
                Label(isArchiving ? "Archiving…" : "Archive chat", systemImage: "archivebox")
            }
            .disabled(isArchiving || agent == .shell)
            Button(role: .destructive) {
                showKillConfirmation = true
            } label: {
                Label("Kill session", systemImage: "xmark.octagon")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
    }

    // A plain toolbar icon that matches the menu/inspector buttons beside it,
    // rather than a custom pill. The pull-request glyph reads as "PR" in both
    // states (a magnifying glass looked like terminal search); colour carries the
    // state — green once a PR exists and the tap opens it, otherwise a muted tap
    // that checks the branch for one.
    private var pullRequestButton: some View {
        Button {
            if let url = links?.prUrl.flatMap(URL.init) {
                toasts.show(.success, "Opening pull request")
                openURL(url)
            } else {
                Task { await checkPullRequest() }
            }
        } label: {
            if isCheckingPullRequest {
                ProgressView()
            } else {
                Image(systemName: "arrow.triangle.pull")
            }
        }
        .foregroundStyle(links?.prUrl != nil ? Color.green : Color.secondary)
        .disabled(isCheckingPullRequest)
        .accessibilityLabel(links?.prUrl != nil ? "Open pull request" : "Check for pull request")
        .help(links?.prUrl != nil ? "Open pull request" : "Check this branch for an open pull request")
    }

    private var errorPresented: Binding<Bool> {
        Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })
    }

    private func saveWorkspace() {
        let name = workspaceName
        let path = workspacePath
        Task {
            do {
                try await api?.saveWorkspace(fromSession: sessionName, name: name, path: path)
                toasts.show(.success, "Saved \(name)")
            } catch {
                actionError = error.localizedDescription
            }
        }
    }

    // Renaming invalidates everything bound to the old name (stream, API calls),
    // so route to a fresh screen for the new name instead of patching in place.
    private func rename() {
        let newName = renameText.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: " ", with: "-")
        guard !newName.isEmpty, newName != sessionName, let api else { return }
        Task {
            do {
                try await api.rename(sessionName, to: newName)
                router.openSession = newName
            } catch {
                actionError = "Couldn't rename. Use letters, digits, dashes or underscores."
            }
        }
    }

    private func loadNotificationPreference() async {
        notificationsMuted = (try? await api?.notificationsMuted(sessionName)) ?? false
    }

    private func toggleNotifications() async {
        let next = !notificationsMuted
        do {
            try await api?.setNotificationsMuted(sessionName, muted: next)
            notificationsMuted = next
        } catch {
            actionError = "Couldn't update notification preferences."
        }
    }

    private func checkPullRequest() async {
        guard let api else { return }
        isCheckingPullRequest = true
        defer { isCheckingPullRequest = false }
        do {
            let fresh = try await api.links(sessionName, refresh: true, includePullRequest: true)
            links = fresh
            if let url = fresh.prUrl.flatMap(URL.init) {
                toasts.show(.success, "Opening pull request")
                openURL(url)
            } else {
                toasts.show(.info, "No open pull request for this branch")
            }
        } catch {
            toasts.show(.error, "Pull request check failed")
            actionError = "Couldn't check for a pull request."
        }
    }

    private func presentRequestedSearchIfNeeded() {
        guard router.terminalSearchSession == sessionName else { return }
        showSearch = true
        router.terminalSearchSession = nil
    }

    private func killWithCleanup() async {
        guard let api else { return }
        isKilling = true
        defer { isKilling = false }
        let worktree = try? await api.worktree(sessionName)
        do {
            try await api.kill(sessionName)
            router.sessionDidDelete(sessionName, worktree: worktree)
        } catch {
            actionError = "Couldn't kill \(sessionName): \(error.localizedDescription)"
        }
    }

    private func archiveConversation() async {
        guard let api, !isArchiving else { return }
        isArchiving = true
        defer { isArchiving = false }
        do {
            _ = try await api.archiveSession(sessionName)
            toasts.show(.success, "Archived \(sessionName)")
            router.sessionDidDelete(sessionName)
        } catch {
            actionError = "Couldn't archive \(sessionName): \(error.localizedDescription)"
        }
    }

    @ViewBuilder
    private var jumpToBottomButton: some View {
        if inCopyMode {
            Button {
                Task { inCopyMode = (try? await api?.scroll(sessionName, action: "bottom")) ?? false }
            } label: {
                Label("Jump to live", systemImage: "arrow.down.to.line")
                    .font(.footnote.weight(.semibold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().stroke(.white.opacity(0.15)))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white)
            .padding(.trailing, 12)
            .padding(.bottom, 12)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    @ViewBuilder
    private var connectionBanner: some View {
        switch streamState {
        case .connected:
            EmptyView()
        case .connecting:
            banner(color: .blue) {
                HStack(spacing: 8) {
                    ProgressView().tint(.white)
                    Text("Connecting…")
                }
            }
        case .reconnecting(let attempt, let maxAttempts):
            banner(color: .orange) {
                HStack(spacing: 8) {
                    ProgressView().tint(.white)
                    Text("Reconnecting… (\(attempt)/\(maxAttempts))")
                }
            }
        case .failed:
            banner(color: .red) {
                HStack {
                    Image(systemName: "wifi.slash")
                    Text("Disconnected")
                    Spacer()
                    Button("Retry") { coordinator?.retry() }
                        .font(.callout.weight(.semibold))
                        .buttonStyle(.borderedProminent)
                        .tint(.white)
                        .foregroundStyle(.red)
                }
            }
        }
    }

    private func banner<Content: View>(color: Color, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .font(.callout)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(color)
    }

    private var quickKeysRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                quickKey("ESC", sends: "escape")
                quickKey("TAB", sends: "tab")
                quickKey("^C", sends: "ctrl-c")
                quickKey("^D", sends: "ctrl-d")
                quickKey("⌫ BACKSPACE", sends: "backspace", accent: true)
                quickKey("↑", sends: "up")
                quickKey("↓", sends: "down")
                quickKey("COPY", sends: "copy-selection")
            }
            .padding(.horizontal, 12)
            .frame(height: 54)
        }
        #if targetEnvironment(macCatalyst)
        .background(FlightDeckPalette.surface)
        .overlay(alignment: .top) { Rectangle().fill(FlightDeckPalette.border).frame(height: 1) }
        #else
        .background(.black.opacity(0.9))
        #endif
    }

    private func quickKey(_ label: String, sends key: String, accent: Bool = false) -> some View {
        Button {
            if key == "copy-selection" {
                coordinator?.copySelection()
            } else {
                Task { try? await api?.sendKeys(sessionName, keys: [key]) }
            }
        } label: {
            Text(label)
                #if targetEnvironment(macCatalyst)
                .font(.flightMono(7))
                .foregroundStyle(accent ? FlightDeckPalette.amber : FlightDeckPalette.secondary)
                .padding(.horizontal, 10)
                .frame(height: 30)
                .overlay(Rectangle().stroke(accent ? FlightDeckPalette.amber.opacity(0.65) : FlightDeckPalette.border))
                #else
                .font(.system(.footnote, design: .monospaced).weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray5), in: RoundedRectangle(cornerRadius: 8))
                #endif
        }
        .buttonStyle(.plain)
        .accessibilityLabel(key == "backspace" ? "Backspace" : label)
    }

    // claude.ai is independent of PR discovery, so fetch only that passive link
    // once. PR lookup remains an explicit user action from the toolbar.
    private func loadClaudeLink() async {
        links = try? await api?.links(sessionName, includePullRequest: false)
    }

    // Backstop for the button state: the pan gesture updates inCopyMode from its
    // own scroll responses, but a poll catches scrolling done from elsewhere and
    // sets the correct initial state.
    private func pollCopyMode() async {
        guard case .connected = streamState else { return }
        while !Task.isCancelled {
            if let mode = try? await api?.inCopyMode(sessionName) {
                withAnimation(.easeInOut(duration: 0.15)) { inCopyMode = mode }
            }
            try? await Task.sleep(for: .seconds(2))
        }
    }
}

/// The Mac terminal accepts physical-keyboard input directly. On iOS it stays
/// read-only so tapping the transcript never competes with the dedicated input
/// field or raises SwiftTerm's accessory keyboard.
private final class ReadOnlyTerminalView: TerminalView {
    var onUserScroll: ((CGFloat) -> Void)?

    override var canBecomeFirstResponder: Bool {
        #if targetEnvironment(macCatalyst)
        true
        #else
        false
        #endif
    }

    // Catalyst's trackpad scroll is ultimately applied by UIScrollView as an
    // offset change. Observing that concrete effect is more reliable than a
    // second gesture recognizer competing with SwiftTerm's built-in one.
    override var contentOffset: CGPoint {
        didSet {
            let state = panGestureRecognizer.state
            guard state == .began || state == .changed,
                  abs(contentOffset.y - oldValue.y) > 0.01 else { return }
            onUserScroll?(contentOffset.y - oldValue.y)
        }
    }
}

private struct TerminalContainer: UIViewRepresentable {
    let sessionName: String
    let serverURL: String
    let token: String
    let fontSize: Double
    @Binding var streamState: StreamState
    @Binding var inCopyMode: Bool
    @Binding var fontSizeStore: Double
    @Binding var coordinator: Coordinator?
    let openURL: OpenURLAction
    let onToast: (ToastCenter.Kind, String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> TerminalView {
        let view = ReadOnlyTerminalView(frame: .zero)
        view.terminalDelegate = context.coordinator
        view.backgroundColor = .black
        view.font = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
        context.coordinator.attach(view: view)
        DispatchQueue.main.async { coordinator = context.coordinator }
        return view
    }

    func updateUIView(_ uiView: TerminalView, context: Context) {
        let target = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
        if uiView.font.pointSize != target.pointSize {
            uiView.font = target
        }
    }

    static func dismantleUIView(_ uiView: TerminalView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class Coordinator: NSObject, TerminalViewDelegate, UIGestureRecognizerDelegate {
        private let parent: TerminalContainer
        private let stream = TerminalStream()
        private weak var terminalView: TerminalView?
        private var lastCols = 0
        private var lastRows = 0
        private var connected = false

        // Pan-to-scroll: translate finger travel into tmux copy-mode line scrolls,
        // coalescing rapid movement into one in-flight request at a time.
        private let lineHeight: CGFloat = 16
        private var unconsumedNativeScroll: CGFloat = 0
        private var pendingLines = 0
        private var scrollInFlight = false
        private var reportedScrollGesture = false
        private var reportedNoHistory = false
        private var pinchBaseFontSize: CGFloat = 13

        init(_ parent: TerminalContainer) {
            self.parent = parent
        }

        func attach(view: TerminalView) {
            terminalView = view
            stream.onBytes = { [weak view] bytes in
                view?.feed(byteArray: bytes[...])
            }
            stream.onStateChange = { [weak self] state in
                self?.parent.streamState = state
            }
            // TerminalView is a UIScrollView. Configure its native recognizer
            // for pointer input, then observe its user-driven content offset.
            let pan = view.panGestureRecognizer
            pan.maximumNumberOfTouches = 2
            pan.allowedScrollTypesMask = [.continuous, .discrete]
            pan.allowedTouchTypes = [
                NSNumber(value: UITouch.TouchType.direct.rawValue),
                NSNumber(value: UITouch.TouchType.indirectPointer.rawValue),
            ]
            view.alwaysBounceVertical = true
            view.allowMouseReporting = false
            (view as? ReadOnlyTerminalView)?.onUserScroll = { [weak self] delta in
                self?.handleNativeScroll(delta)
            }

            let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch))
            pinch.delegate = self
            view.addGestureRecognizer(pinch)

            #if targetEnvironment(macCatalyst)
            // SwiftTerm already implements UIKeyInput. Giving the Catalyst view
            // first-responder status routes physical key events into `send`.
            let focusTap = UITapGestureRecognizer(target: self, action: #selector(focusTerminal))
            focusTap.delegate = self
            focusTap.cancelsTouchesInView = false
            view.addGestureRecognizer(focusTap)
            #else
            // On iOS, tapping the read-only transcript dismisses the composer.
            let dismissTap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
            dismissTap.delegate = self
            dismissTap.cancelsTouchesInView = false
            view.addGestureRecognizer(dismissTap)
            #endif
            // Connection is deferred to the first sizeChanged, so the PTY starts
            // at the real device dimensions instead of a hardcoded guess.
        }

        func retry() {
            stream.retry()
        }

        func copySelection() {
            terminalView?.copy(nil)
        }

        func detach() {
            (terminalView as? ReadOnlyTerminalView)?.onUserScroll = nil
            stream.disconnect()
        }

        // Coexist with SwiftTerm's own recognizers (long-press select, taps).
        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }

        @objc private func dismissKeyboard() {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }

        @objc private func focusTerminal() {
            _ = terminalView?.becomeFirstResponder()
        }

        @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
            guard let view = terminalView else { return }
            switch recognizer.state {
            case .began:
                pinchBaseFontSize = view.font.pointSize
            case .changed, .ended:
                let size = min(max(pinchBaseFontSize * recognizer.scale, 9), 28)
                if abs(view.font.pointSize - size) > 0.3 {
                    view.font = UIFont.monospacedSystemFont(ofSize: size, weight: .regular)
                }
                if recognizer.state == .ended {
                    parent.fontSizeStore = Double(view.font.pointSize)
                }
            default:
                break
            }
        }

        private func handleNativeScroll(_ offsetDelta: CGFloat) {
            if !reportedScrollGesture {
                reportedScrollGesture = true
                parent.onToast(.info, "Trackpad scroll offset received")
            }
            // Increasing UIScrollView's offset moves toward newer output.
            // Invert it for tmux's copy-mode directions.
            unconsumedNativeScroll -= offsetDelta
            let lines = Int(unconsumedNativeScroll / lineHeight)
            guard lines != 0 else { return }
            unconsumedNativeScroll -= CGFloat(lines) * lineHeight
            pendingLines += lines
            flushScroll()
        }

        private func flushScroll() {
            guard !scrollInFlight, pendingLines != 0,
                  let api = APIClient(urlString: parent.serverURL, token: parent.token) else { return }
            scrollInFlight = true
            let net = pendingLines
            pendingLines = 0
            let action = net > 0 ? "up" : "down"
            let count = abs(net)
            Task { @MainActor in
                do {
                    let mode = try await api.scroll(parent.sessionName, action: action, lines: count)
                    if mode && !parent.inCopyMode {
                        parent.onToast(.success, "Terminal scrollback active")
                    } else if !mode && !reportedNoHistory {
                        reportedNoHistory = true
                        parent.onToast(.info, "No additional terminal history")
                    }
                    withAnimation(.easeInOut(duration: 0.15)) { parent.inCopyMode = mode }
                } catch {
                    parent.onToast(.error, "Terminal scroll failed: \(error.localizedDescription)")
                }
                scrollInFlight = false
                flushScroll()
            }
        }

        func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
            guard newCols > 0, newRows > 0 else { return }
            if !connected {
                connected = true
                lastCols = newCols
                lastRows = newRows
                guard let api = APIClient(urlString: parent.serverURL, token: parent.token),
                      let url = api.webSocketURL(session: parent.sessionName, cols: newCols, rows: newRows) else { return }
                stream.connect(url: url, token: parent.token)
                return
            }
            guard newCols != lastCols || newRows != lastRows else { return }
            lastCols = newCols
            lastRows = newRows
            stream.resize(cols: newCols, rows: newRows)
        }

        func send(source: TerminalView, data: ArraySlice<UInt8>) {
            stream.sendInput(String(decoding: Data(data), as: UTF8.self))
        }

        func setTerminalTitle(source: TerminalView, title: String) {}
        func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
        func scrolled(source: TerminalView, position: Double) {}
        func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
            guard let url = URL(string: link) else { return }
            DispatchQueue.main.async { self.parent.openURL(url) }
        }

        func clipboardCopy(source: TerminalView, content: Data) {
            UIPasteboard.general.setData(content, forPasteboardType: "public.utf8-plain-text")
        }
        func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
        func bell(source: TerminalView) {}
        func iTermContent(source: TerminalView, content: ArraySlice<UInt8>) {}
    }
}
