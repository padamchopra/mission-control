import SwiftTerm
import SwiftUI

// SwiftTerm also exports a `Color`; pin the bare name to SwiftUI's in this file.
private typealias Color = SwiftUI.Color

struct TerminalScreen: View {
    let sessionName: String

    @AppStorage("serverURL") private var serverURL = "http://127.0.0.1:8420"
    @AppStorage("serverToken") private var serverToken = ""
    @State private var streamState: StreamState = .connecting
    @State private var inCopyMode = false
    @State private var coordinator: TerminalContainer.Coordinator?

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    var body: some View {
        VStack(spacing: 0) {
            connectionBanner
            ZStack(alignment: .bottomTrailing) {
                TerminalContainer(
                    sessionName: sessionName,
                    serverURL: serverURL,
                    token: serverToken,
                    streamState: $streamState,
                    inCopyMode: $inCopyMode,
                    coordinator: $coordinator
                )
                .ignoresSafeArea(.container, edges: .horizontal)
                jumpToBottomButton
            }
            quickKeysRow
            MessageComposer(sessionName: sessionName)
        }
        .background(Color.black)
        .navigationTitle(sessionName)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: streamState) { await pollCopyMode() }
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

private struct TerminalContainer: UIViewRepresentable {
    let sessionName: String
    let serverURL: String
    let token: String
    @Binding var streamState: StreamState
    @Binding var inCopyMode: Bool
    @Binding var coordinator: Coordinator?

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> TerminalView {
        let view = TerminalView(frame: .zero)
        view.terminalDelegate = context.coordinator
        view.backgroundColor = .black
        context.coordinator.attach(view: view)
        DispatchQueue.main.async { coordinator = context.coordinator }
        return view
    }

    func updateUIView(_ uiView: TerminalView, context: Context) {}

    static func dismantleUIView(_ uiView: TerminalView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class Coordinator: NSObject, TerminalViewDelegate, UIGestureRecognizerDelegate {
        private let parent: TerminalContainer
        private let stream = TerminalStream()
        private weak var terminalView: TerminalView?
        private var lastCols = 0
        private var lastRows = 0

        // Pan-to-scroll: translate finger travel into tmux copy-mode line scrolls,
        // coalescing rapid movement into one in-flight request at a time.
        private let lineHeight: CGFloat = 16
        private var panEmittedTranslation: CGFloat = 0
        private var pendingLines = 0
        private var scrollInFlight = false

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
            let pan = UIPanGestureRecognizer(target: self, action: #selector(handleScrollPan))
            pan.delegate = self
            view.addGestureRecognizer(pan)

            guard let api = APIClient(urlString: parent.serverURL, token: parent.token),
                  let url = api.webSocketURL(session: parent.sessionName, cols: 48, rows: 30) else { return }
            stream.connect(url: url, token: parent.token)
        }

        func retry() {
            stream.retry()
        }

        func detach() {
            stream.disconnect()
        }

        // Coexist with SwiftTerm's own recognizers (long-press select, taps).
        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }

        @objc private func handleScrollPan(_ recognizer: UIPanGestureRecognizer) {
            switch recognizer.state {
            case .began:
                panEmittedTranslation = 0
            case .changed:
                let translationY = recognizer.translation(in: recognizer.view).y
                let unemitted = translationY - panEmittedTranslation
                let lines = Int(unemitted / lineHeight)
                guard lines != 0 else { return }
                panEmittedTranslation += CGFloat(lines) * lineHeight
                // Finger moving down (positive) reveals older content → scroll up.
                pendingLines += lines
                flushScroll()
            case .ended, .cancelled, .failed:
                panEmittedTranslation = 0
            default:
                break
            }
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
                let mode = (try? await api.scroll(parent.sessionName, action: action, lines: count)) ?? false
                withAnimation(.easeInOut(duration: 0.15)) { parent.inCopyMode = mode }
                scrollInFlight = false
                flushScroll()
            }
        }

        func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
            guard newCols != lastCols || newRows != lastRows, newCols > 0, newRows > 0 else { return }
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
        func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {}
        func clipboardCopy(source: TerminalView, content: Data) {}
        func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
        func bell(source: TerminalView) {}
        func iTermContent(source: TerminalView, content: ArraySlice<UInt8>) {}
    }
}
