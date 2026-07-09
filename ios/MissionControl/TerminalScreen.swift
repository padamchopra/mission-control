import SwiftTerm
import SwiftUI

// SwiftTerm also exports a `Color`; pin the bare name to SwiftUI's in this file.
private typealias Color = SwiftUI.Color

struct TerminalScreen: View {
    let sessionName: String

    @AppStorage("serverURL") private var serverURL = "http://127.0.0.1:8420"
    @AppStorage("serverToken") private var serverToken = ""
    @State private var message = ""
    @State private var streamState: StreamState = .connecting
    @State private var coordinator: TerminalContainer.Coordinator?
    @FocusState private var inputFocused: Bool

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    var body: some View {
        VStack(spacing: 0) {
            connectionBanner
            ZStack(alignment: .trailing) {
                TerminalContainer(
                    sessionName: sessionName,
                    serverURL: serverURL,
                    token: serverToken,
                    streamState: $streamState,
                    coordinator: $coordinator
                )
                .ignoresSafeArea(.container, edges: .horizontal)
                scrollControls
            }
            quickKeysRow
            inputBar
        }
        .background(Color.black)
        .navigationTitle(sessionName)
        .navigationBarTitleDisplayMode(.inline)
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

    private var scrollControls: some View {
        VStack(spacing: 10) {
            scrollButton("chevron.up", action: "page-up")
            scrollButton("chevron.down", action: "page-down")
            scrollButton("arrow.down.to.line", action: "bottom")
        }
        .padding(.trailing, 10)
        .padding(.bottom, 12)
        .frame(maxHeight: .infinity, alignment: .bottom)
    }

    private func scrollButton(_ systemName: String, action: String) -> some View {
        Button {
            Task { try? await api?.scroll(sessionName, action: action) }
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 40, height: 40)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().stroke(.white.opacity(0.15)))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
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

    private var inputBar: some View {
        HStack(spacing: 8) {
            TextField("Message Claude…", text: $message, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...4)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .focused($inputFocused)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 18))
            Button {
                submitMessage()
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
            }
            .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.black)
    }

    private func submitMessage() {
        let text = message
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        message = ""
        Task { try? await api?.sendText(sessionName, text: text) }
    }
}

private struct TerminalContainer: UIViewRepresentable {
    let sessionName: String
    let serverURL: String
    let token: String
    @Binding var streamState: StreamState
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

    final class Coordinator: NSObject, TerminalViewDelegate {
        private let parent: TerminalContainer
        private let stream = TerminalStream()
        private weak var terminalView: TerminalView?
        private var lastCols = 0
        private var lastRows = 0

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
