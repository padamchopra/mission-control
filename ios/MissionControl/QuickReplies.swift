import Combine
import SwiftUI

/// The composer's quick replies, stored on the server so every client that
/// connects — the iPhone and the Mac app — shares one list without any
/// per-device setup. Matches the app's "source of truth lives on the Mac"
/// principle.
///
/// Replies are held per active server and cached in `UserDefaults` (keyed by
/// server id) so the menu shows instantly and offline; the cache is refreshed
/// from the server whenever the active server changes or the editor appears.
final class QuickRepliesStore: ObservableObject {
    static let shared = QuickRepliesStore()

    static let defaults = [
        "Continue", "Run the tests", "Commit and push",
        "Explain your plan first", "Yes, go ahead", "Undo the last change",
    ]

    @Published private(set) var replies: [String] = []

    private var activeServerID: String?
    private var cancellable: AnyCancellable?

    private init() {
        apply(server: ServerStore.shared.active)
        // React when the user switches (or first connects to) a server. dropFirst
        // skips the value replayed on subscription, which the apply above covered.
        cancellable = ServerStore.shared.$activeID
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.apply(server: ServerStore.shared.active) }
    }

    /// Load the given server's cached replies immediately, then refresh from it.
    private func apply(server: Server?) {
        activeServerID = server?.id
        replies = cached(for: server) ?? QuickRepliesStore.defaults
        Task { await refresh() }
    }

    /// Pull the active server's list and update the cache. A no-op offline or on a
    /// server too old to know the endpoint — the cached list keeps showing.
    func refresh() async {
        guard let server = ServerStore.shared.active,
              let api = APIClient(urlString: server.url, token: server.token),
              let fetched = try? await api.quickReplies() else { return }
        await MainActor.run {
            guard server.id == activeServerID else { return } // a newer switch won
            replies = fetched
            cache(fetched, for: server)
        }
    }

    func add(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !replies.contains(trimmed) else { return }
        save(replies + [trimmed])
    }

    func remove(at offsets: IndexSet) {
        var next = replies
        next.remove(atOffsets: offsets)
        save(next)
    }

    func move(from source: IndexSet, to destination: Int) {
        var next = replies
        next.move(fromOffsets: source, toOffset: destination)
        save(next)
    }

    func resetToDefaults() { save(QuickRepliesStore.defaults) }

    /// Apply a live edit pushed over the notify stream from another device.
    /// Always refreshes that server's cache; updates the visible list only if
    /// it's the active server.
    @MainActor
    func applyPushed(_ pushed: [String], for server: Server) {
        cache(pushed, for: server)
        if server.id == activeServerID, pushed != replies { replies = pushed }
    }

    // Optimistically apply and cache, then push to the server in the background.
    private func save(_ newReplies: [String]) {
        replies = newReplies
        guard let server = ServerStore.shared.active else { return }
        cache(newReplies, for: server)
        guard let api = APIClient(urlString: server.url, token: server.token) else { return }
        Task { try? await api.saveQuickReplies(newReplies) }
    }

    private func cacheKey(_ server: Server?) -> String? {
        server.map { "quickReplies.\($0.id)" }
    }

    private func cached(for server: Server?) -> [String]? {
        cacheKey(server).flatMap { UserDefaults.standard.stringArray(forKey: $0) }
    }

    private func cache(_ replies: [String], for server: Server?) {
        guard let key = cacheKey(server) else { return }
        UserDefaults.standard.set(replies, forKey: key)
    }
}

/// Settings editor for the quick replies: add, delete, reorder, or reset.
struct QuickRepliesView: View {
    @ObservedObject private var store = QuickRepliesStore.shared
    @ObservedObject private var servers = ServerStore.shared
    @State private var newReply = ""
    @FocusState private var addFocused: Bool

    var body: some View {
        List {
            if let server = servers.active {
                editorSection(serverName: server.name)
                if store.replies != QuickRepliesStore.defaults {
                    Section {
                        Button("Reset to defaults") { store.resetToDefaults() }
                    }
                }
            } else {
                Section {
                    Text("Connect to a server to set up quick replies. They're stored on the server and shared with every device that connects to it.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Quick replies")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { if servers.active != nil { EditButton() } }
        .task { await store.refresh() }
    }

    private func editorSection(serverName: String) -> some View {
        Section {
            ForEach(store.replies, id: \.self) { reply in
                Text(reply)
            }
            .onDelete { store.remove(at: $0) }
            .onMove { store.move(from: $0, to: $1) }

            HStack {
                TextField("Add a quick reply", text: $newReply)
                    .focused($addFocused)
                    .submitLabel(.done)
                    .onSubmit(add)
                Button(action: add) {
                    Image(systemName: "plus.circle.fill")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
                .disabled(newReply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        } header: {
            Text("Quick replies")
        } footer: {
            Text("Pick one from the ⚡ menu next to the message box to drop it into the composer. Stored on \(serverName) and shared with every device that connects to it.")
        }
    }

    private func add() {
        store.add(newReply)
        newReply = ""
        addFocused = true
    }
}
