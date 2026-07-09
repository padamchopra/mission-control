import SwiftUI

struct SessionListView: View {
    @AppStorage("serverURL") private var serverURL = "http://127.0.0.1:8420"
    @AppStorage("serverToken") private var serverToken = ""
    @State private var sessions: [TmuxSession] = []
    @State private var hasLoaded = false
    @State private var loadError: String?
    @State private var showSettings = false
    @State private var pendingKill: TmuxSession?
    @State private var path: [String] = []

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    var body: some View {
        NavigationStack(path: $path) {
            content
                .navigationTitle("Mission Control")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                        }
                    }
                }
                .navigationDestination(for: String.self) { name in
                    TerminalScreen(sessionName: name)
                }
                .sheet(isPresented: $showSettings) {
                    SettingsView()
                }
                .confirmationDialog(
                    "Kill session?",
                    isPresented: Binding(
                        get: { pendingKill != nil },
                        set: { if !$0 { pendingKill = nil } }
                    ),
                    presenting: pendingKill
                ) { session in
                    Button("Kill \(session.name)", role: .destructive) {
                        Task { await kill(session) }
                    }
                } message: { session in
                    Text("This kills the tmux session and everything running in it (\(session.name)).")
                }
                .task(id: serverURL + serverToken) {
                    await autoRefresh()
                }
                .onOpenURL { url in
                    if url.host == "session", let name = url.pathComponents.dropFirst().first {
                        path = [name]
                    }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if api == nil {
            ContentUnavailableView(
                "No server configured",
                systemImage: "gearshape",
                description: Text("Set the mini's address and token in settings.")
            )
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
                description: Text("Nothing is running in tmux on the mini right now.")
            )
        } else {
            sessionList
        }
    }

    private var sessionList: some View {
        List {
            ForEach(sessions) { session in
                NavigationLink(value: session.name) {
                    SessionRow(session: session)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        pendingKill = session
                    } label: {
                        Label("Kill", systemImage: "xmark.octagon")
                    }
                }
            }
        }
        .refreshable { await load() }
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
            sessions = try await api.sessions()
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
        hasLoaded = true
    }

    private func kill(_ session: TmuxSession) async {
        guard let api else { return }
        do {
            try await api.kill(session.name)
            sessions.removeAll { $0.name == session.name }
        } catch {
            loadError = error.localizedDescription
        }
    }
}

private struct SessionRow: View {
    let session: TmuxSession

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(session.name)
                    .font(.headline)
                Spacer()
                stateChip
            }
            Text("\(session.paneCommand) · \(session.lastOutputDate.formatted(.relative(presentation: .named)))")
                .font(.caption)
                .foregroundStyle(.secondary)
            if let detail = session.detail, session.resolvedState == .needsInput {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
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
