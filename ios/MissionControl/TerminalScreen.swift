import SwiftTerm
import SwiftUI
import UIKit

// SwiftTerm also exports a `Color`; pin the bare name to SwiftUI's in this file.
private typealias Color = SwiftUI.Color

private enum SessionMode { case conversation, terminal }

struct TerminalScreen: View {
    let sessionName: String

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
    @State private var actionError: String?
    @State private var notificationsMuted = false
    @State private var showActivity = false
    @State private var showSearch = false
    @State private var mode: SessionMode = .conversation
    #if targetEnvironment(macCatalyst)
    @State private var showInspector = false
    #endif
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var toasts: ToastCenter
    @Environment(\.openURL) private var openURL

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    var body: some View {
        content
            .background(Color.black)
        .navigationTitle(sessionName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                pullRequestButton
                #if targetEnvironment(macCatalyst)
                inspectorToggle
                #endif
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
        .task { presentRequestedSearchIfNeeded() }
        .onChange(of: router.terminalSearchSession) { _, _ in
            presentRequestedSearchIfNeeded()
        }
        .sheet(isPresented: $showActivity) {
            SessionActivitySheet(sessionName: sessionName, serverURL: serverURL, token: serverToken)
        }
        .sheet(isPresented: $showSearch) {
            TerminalSearchSheet(sessionName: sessionName, serverURL: serverURL, token: serverToken)
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
                        actionError = "Couldn't save workspace. Check that the path exists on the server."
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
    }

    // On the Mac, the detail can host an optional inspector beside the main
    // column. On the phone there's no room, so it's just the main column.
    @ViewBuilder
    private var content: some View {
        #if targetEnvironment(macCatalyst)
        HStack(spacing: 0) {
            mainColumn
            if showInspector {
                Divider()
                SessionInspector(sessionName: sessionName, serverURL: serverURL, token: serverToken)
                    .frame(width: 320)
                    .transition(.move(edge: .trailing))
            }
        }
        #else
        mainColumn
        #endif
    }

    private var mainColumn: some View {
        VStack(spacing: 0) {
            if mode == .terminal { connectionBanner }
            modeBar
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
            MessageComposer(sessionName: sessionName)
        }
    }

    #if targetEnvironment(macCatalyst)
    private var inspectorToggle: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { showInspector.toggle() }
        } label: {
            Image(systemName: "sidebar.trailing")
        }
        .foregroundStyle(showInspector ? Color.accentColor : Color.primary)
        .keyboardShortcut("i", modifiers: [.command, .option])
        .help("Toggle inspector (Changes · Plan · Checks)")
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
            Button {
                showActivity = true
            } label: {
                Label("View activity", systemImage: "clock.arrow.circlepath")
            }
            Button {
                showSearch = true
            } label: {
                Label("Find in terminal", systemImage: "magnifyingglass")
            }
            .keyboardShortcut("f", modifiers: .command)
            Divider()
            Button(role: .destructive) {
                showKillConfirmation = true
            } label: {
                Label("Kill session", systemImage: "xmark.octagon")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
    }

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
                    .frame(minWidth: 84)
            } else if links?.prUrl != nil {
                Label("Open PR", systemImage: "arrow.triangle.pull")
                    .foregroundStyle(.white)
            } else {
                Label("Check PR", systemImage: "magnifyingglass")
            }
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            links?.prUrl != nil ? Color.green : Color.white.opacity(0.1),
            in: Capsule()
        )
        .overlay {
            Capsule()
                .stroke(links?.prUrl != nil ? Color.green : Color.white.opacity(0.18), lineWidth: 1)
        }
        .disabled(isCheckingPullRequest)
        .accessibilityLabel(links?.prUrl != nil ? "Open pull request" : "Check for pull request")
        .help(links?.prUrl != nil ? "Open pull request" : "Check this branch for an open pull request")
    }

    private var errorPresented: Binding<Bool> {
        Binding(get: { actionError != nil }, set: { if !$0 { actionError = nil } })
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
            HStack(spacing: 8) {
                quickKey("esc", sends: "escape")
                quickKey("tab", sends: "tab")
                quickKey("⇧⇥", sends: "shift-tab")
                quickKey("↑", sends: "up")
                quickKey("↓", sends: "down")
                quickKey("←", sends: "left")
                quickKey("→", sends: "right")
                quickKey("1", sends: "1")
                quickKey("2", sends: "2")
                quickKey("3", sends: "3")
                quickKey("⏎", sends: "enter")
                quickKey("^C", sends: "ctrl-c")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .background(.black.opacity(0.9))
    }

    private func quickKey(_ label: String, sends key: String) -> some View {
        Button {
            Task { try? await api?.sendKeys(sessionName, keys: [key]) }
        } label: {
            Text(label)
                .font(.system(.footnote, design: .monospaced).weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray5), in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
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

/// The terminal is a read-and-scroll surface, not a text input: refusing first
/// responder means tapping it never raises the keyboard or SwiftTerm's own
/// accessory bar. All input goes through the single message field + quick keys.
private final class ReadOnlyTerminalView: TerminalView {
    var onUserScroll: ((CGFloat) -> Void)?

    override var canBecomeFirstResponder: Bool { false }

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

            // Tapping the (read-only) terminal dismisses the message keyboard.
            let dismissTap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
            dismissTap.delegate = self
            dismissTap.cancelsTouchesInView = false
            view.addGestureRecognizer(dismissTap)
            // Connection is deferred to the first sizeChanged, so the PTY starts
            // at the real device dimensions instead of a hardcoded guess.
        }

        func retry() {
            stream.retry()
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
