import Combine
import SwiftUI

/// The active server's chats, kept live from the push channel.
///
/// A chat has no terminal behind it — the server owns the Claude process and
/// streams what it produces — so this store is the client's whole view of one:
/// the list for the tab, and the full feed for whichever chat is open. Pushes
/// patch what's already here rather than triggering a refetch, so a streaming
/// paragraph costs no requests at all.
@MainActor
final class ChatStore: ObservableObject {
    static let shared = ChatStore()

    @Published private(set) var chats: [ChatSummary] = []
    @Published private(set) var details: [String: ChatDetail] = [:]
    @Published private(set) var loadError: String?
    @Published private(set) var hasLoaded = false

    private var serverID: String?
    private var cancellables: Set<AnyCancellable> = []
    private var refreshTask: Task<Void, Never>?

    /// Chats waiting on an approval or a question, for the tab badge.
    var waitingCount: Int { chats.filter { $0.state == .needsInput }.count }

    private init() {
        ServerStore.shared.$activeID
            .sink { _ in Task { @MainActor [weak self] in self?.serverDidChange() } }
            .store(in: &cancellables)

        PushChannel.shared.chatUpdates
            .sink { push in Task { @MainActor [weak self] in self?.apply(push) } }
            .store(in: &cancellables)

        PushChannel.shared.chatListChanges
            .sink { url in
                Task { @MainActor [weak self] in
                    guard url == ServerStore.shared.active?.url else { return }
                    self?.requestRefresh()
                }
            }
            .store(in: &cancellables)
    }

    private var api: APIClient? {
        guard let server = ServerStore.shared.active else { return nil }
        return APIClient(urlString: server.url, token: server.token)
    }

    // MARK: - Loading

    func refresh() async {
        guard let api else {
            chats = []
            details = [:]
            hasLoaded = true
            return
        }
        do {
            let fetched = try await api.chats()
            chats = fetched
            loadError = nil
            // Drop details for chats that no longer exist, so a deleted chat
            // can't be reopened from a stale cache.
            let ids = Set(fetched.map(\.id))
            details = details.filter { ids.contains($0.key) }
        } catch {
            loadError = error.localizedDescription
        }
        hasLoaded = true
    }

    /// Pulls one chat's full feed. Called when a chat opens; after that the push
    /// channel keeps it current.
    func loadDetail(_ id: String) async {
        guard let api else { return }
        do {
            let detail = try await api.chat(id)
            details[id] = detail
            upsertSummary(detail.summary)
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    func detail(_ id: String) -> ChatDetail? { details[id] }

    func summary(_ id: String) -> ChatSummary? { chats.first { $0.id == id } }

    // MARK: - Actions

    func create(cwd: String, title: String?, model: ChatModel, permissionMode: ChatPermissionMode) async throws -> ChatSummary {
        guard let api else { throw APIError.server("No server is connected.") }
        let chat = try await api.createChat(
            cwd: cwd,
            title: title,
            model: model.value,
            permissionMode: permissionMode
        )
        upsertSummary(chat)
        return chat
    }

    func send(_ id: String, text: String) async throws {
        guard let api else { throw APIError.server("No server is connected.") }
        // Show the prompt immediately. The server records its own copy and pushes
        // it back, which drops this placeholder — see `dropLocalPrompts`.
        appendLocalPrompt(id, text: text)
        try await api.sendChatMessage(id, text: text)
    }

    func interrupt(_ id: String) async throws {
        guard let api else { return }
        try await api.interruptChat(id)
    }

    func respond(_ id: String, requestId: String, decision: String) async throws {
        guard let api else { return }
        try await api.respondToChatApproval(id, requestId: requestId, decision: decision)
    }

    func answer(_ id: String, requestId: String, answers: [String: String]) async throws {
        guard let api else { return }
        try await api.answerChatQuestion(id, requestId: requestId, answers: answers)
    }

    func update(_ id: String, title: String? = nil, model: ChatModel? = nil, permissionMode: ChatPermissionMode? = nil) async throws {
        guard let api else { return }
        let chat = try await api.updateChat(
            id,
            title: title,
            model: model.map { $0.value },
            permissionMode: permissionMode
        )
        upsertSummary(chat)
        if var detail = details[id] {
            detail.title = chat.title
            detail.model = chat.model
            detail.permissionMode = chat.permissionMode
            detail.live = chat.live
            details[id] = detail
        }
    }

    func delete(_ id: String) async throws {
        guard let api else { return }
        try await api.deleteChat(id)
        chats.removeAll { $0.id == id }
        details[id] = nil
    }

    // MARK: - Live updates

    private func apply(_ push: ChatPush) {
        guard push.serverURL == ServerStore.shared.active?.url else { return }
        // A chat that isn't in the list yet (created on another device) needs the
        // list, not a patch of nothing.
        guard chats.contains(where: { $0.id == push.chatId }) || details[push.chatId] != nil else {
            requestRefresh()
            return
        }

        if var detail = details[push.chatId] {
            if let removed = push.removed {
                detail.entries.removeAll { removed.contains($0.id) }
            }
            for entry in push.entries ?? [] {
                if entry.kind == "user" { detail.entries = dropLocalPrompts(detail.entries, matching: entry) }
                if let index = detail.entries.firstIndex(where: { $0.id == entry.id }) {
                    detail.entries[index] = entry
                } else {
                    detail.entries.append(entry)
                }
            }
            // Only a push that carries `state` carries the rest of the scalars.
            if let state = push.state {
                detail.state = state
                detail.action = push.action
                detail.approval = push.approval
                detail.question = push.question
                detail.error = push.error
                if let todos = push.todos { detail.todos = todos }
                if let context = push.context { detail.context = context }
                if let title = push.title { detail.title = title }
                if let live = push.live { detail.live = live }
                if let updatedAt = push.updatedAt { detail.updatedAt = updatedAt }
            }
            details[push.chatId] = detail
        }

        guard let index = chats.firstIndex(where: { $0.id == push.chatId }) else { return }
        var summary = chats[index]
        if let state = push.state {
            summary.state = state
            summary.action = push.action
            summary.error = push.error
            if let context = push.context { summary.context = context }
            if let title = push.title { summary.title = title }
            if let live = push.live { summary.live = live }
            if let updatedAt = push.updatedAt { summary.updatedAt = updatedAt }
        }
        if let preview = push.entries?.last(where: { ($0.kind == "assistant" || $0.kind == "user") && $0.text?.isEmpty == false })?.text {
            summary.preview = preview
        }
        chats[index] = summary
        chats.sort { $0.updatedAt > $1.updatedAt }
    }

    /// The server clips long prompts, so a placeholder is matched on a
    /// whitespace-collapsed prefix rather than the whole string — the same test
    /// the server uses to reconcile a queued tmux prompt.
    private func dropLocalPrompts(_ entries: [ConversationEntry], matching entry: ConversationEntry) -> [ConversationEntry] {
        let key = { (text: String) in
            text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .prefix(160)
        }
        guard let incoming = entry.text.map(key) else { return entries }
        return entries.filter { candidate in
            guard candidate.id.hasPrefix("local-"), let text = candidate.text else { return true }
            return key(text) != incoming
        }
    }

    /// Whoever typed the message shouldn't wait a round trip to see it.
    private func appendLocalPrompt(_ id: String, text: String) {
        guard var detail = details[id] else { return }
        detail.entries.append(ConversationEntry(id: "local-\(UUID().uuidString)", kind: "user", text: text))
        detail.state = .working
        details[id] = detail
        if let index = chats.firstIndex(where: { $0.id == id }) {
            chats[index].state = .working
            chats[index].preview = text
        }
    }

    private func upsertSummary(_ chat: ChatSummary) {
        if let index = chats.firstIndex(where: { $0.id == chat.id }) {
            chats[index] = chat
        } else {
            chats.insert(chat, at: 0)
        }
        chats.sort { $0.updatedAt > $1.updatedAt }
    }

    /// Coalesce refetches: a burst of list changes (a chat created, renamed, and
    /// answered in the same second) should cost one request.
    private func requestRefresh() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }

    private func serverDidChange() {
        guard ServerStore.shared.activeID != serverID else { return }
        serverID = ServerStore.shared.activeID
        chats = []
        details = [:]
        hasLoaded = false
        loadError = nil
        requestRefresh()
    }
}

/// A locally-built entry, for the optimistic prompt bubble.
extension ConversationEntry {
    init(id: String, kind: String, text: String?) {
        self.init(
            id: id,
            kind: kind,
            text: text,
            tool: nil,
            verb: nil,
            arg: nil,
            status: nil,
            output: nil,
            file: nil,
            skill: nil,
            diff: nil,
            adds: nil,
            dels: nil,
            questions: nil
        )
    }
}
