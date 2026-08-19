import Combine
import Foundation
import UserNotifications

/// Holds a WebSocket to every configured server's /notify/stream. It carries two
/// things: live session state, which both platforms use so the UI repaints the
/// moment a hook fires instead of waiting out a poll, and — on the Mac only —
/// Agent notifications, shown as native banners. The Mac's open socket is the
/// presence signal that keeps the phone quiet, so the phone connects with
/// `notifies: false` and stays on ntfy for its banners. Reconnects patiently
/// forever.
final class NotifyStreamManager: NSObject {
    static let shared = NotifyStreamManager()

    private var streams: [String: Task<Void, Never>] = [:]
    private var serversSubscription: AnyCancellable?
    private var recentlyPosted: [String: Date] = [:]
    private var presentsNotifications = false

    /// - Parameter presentingNotifications: true on the desktop, where this app
    ///   is the notification target. The phone passes false — asking for
    ///   notification permission it never uses would be a prompt for nothing.
    func activate(presentingNotifications: Bool) {
        guard serversSubscription == nil else { return }
        presentsNotifications = presentingNotifications
        if presentingNotifications {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        }
        serversSubscription = ServerStore.shared.$servers
            .receive(on: DispatchQueue.main)
            .sink { [weak self] servers in self?.restart(servers) }
    }

    /// Drop and re-open every socket. The phone calls this when it returns to
    /// the foreground: iOS suspends the app and the socket dies with it, and
    /// waiting out the reconnect backoff would leave the first seconds back in
    /// the app running on stale data.
    func reconnectNow() {
        Task { @MainActor in self.restart(ServerStore.shared.servers) }
    }

    private func restart(_ servers: [Server]) {
        for stream in streams.values { stream.cancel() }
        streams = servers.reduce(into: [:]) { acc, server in
            acc[server.id] = Task { await self.run(server) }
        }
    }

    private func run(_ server: Server) async {
        while !Task.isCancelled {
            if let socket = openSocket(server) {
                await receiveLoop(socket, server: server)
                socket.cancel(with: .goingAway, reason: nil)
            }
            await PushChannel.shared.markDown(server.url)
            if Task.isCancelled { return }
            try? await Task.sleep(for: .seconds(20))
        }
    }

    private func openSocket(_ server: Server) -> URLSessionWebSocketTask? {
        guard let api = APIClient(urlString: server.url, token: server.token),
              let url = api.notifyWebSocketURL(notifies: presentsNotifications) else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(server.token)", forHTTPHeaderField: "Authorization")
        let socket = URLSession.shared.webSocketTask(with: request)
        socket.resume()
        return socket
    }

    private func receiveLoop(_ socket: URLSessionWebSocketTask, server: Server) async {
        while !Task.isCancelled {
            guard let message = try? await socket.receive() else { return }
            let data: Data?
            switch message {
            case .string(let text): data = text.data(using: .utf8)
            case .data(let raw): data = raw
            @unknown default: data = nil
            }
            guard let data else { continue }
            await handle(data, server: server)
        }
    }

    private func handle(_ data: Data, server: Server) async {
        // Notifications carry no `type` (or "notification"); other payloads —
        // live state, list invalidations, quick-reply edits — are tagged.
        let type = (try? JSONDecoder().decode(WSEnvelope.self, from: data))?.type
        switch type {
        case "hello":
            // Only a server that greets us pushes state. Without this the
            // client can't tell "nothing has changed" from "this server is too
            // old to tell me", and would slow-poll its way into staleness.
            await PushChannel.shared.markLive(server.url)
        case "session":
            if let push = try? JSONDecoder().decode(SessionPushPayload.self, from: data) {
                await PushChannel.shared.emit(push.event(from: server))
            }
        case "sessions":
            await PushChannel.shared.emitSessionListChange(server.url)
        case "quick-replies":
            if let push = try? JSONDecoder().decode(QuickRepliesPush.self, from: data) {
                await QuickRepliesStore.shared.applyPushed(push.replies, for: server)
            }
        // A chat's feed and state, patched as the turn happens. This is the only
        // way a chat updates live: the server owns the Claude process, so there
        // is nothing for the client to poll faster than it can be told.
        case "chat":
            if let push = try? JSONDecoder().decode(ChatPushPayload.self, from: data) {
                await PushChannel.shared.emit(push.event(from: server))
            }
        case "chats":
            await PushChannel.shared.emitChatListChange(server.url)
        default:
            guard presentsNotifications else { return }
            if let event = try? JSONDecoder().decode(NotifyEvent.self, from: data) {
                await post(event)
            }
        }
    }

    private func post(_ event: NotifyEvent) async {
        let key = "\(event.session)|\(event.title)|\(event.message)|\(event.highPriority)"
        let now = Date()
        if let previous = recentlyPosted[key], now.timeIntervalSince(previous) < 30 {
            return
        }
        recentlyPosted[key] = now
        recentlyPosted = recentlyPosted.filter { now.timeIntervalSince($0.value) < 5 * 60 }

        let content = UNMutableNotificationContent()
        content.title = event.title
        content.body = event.message
        content.sound = event.highPriority ? .default : nil
        content.userInfo = ["session": event.session, "click": event.click ?? ""]
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }
}

struct NotifyEvent: Codable {
    let session: String
    let title: String
    let message: String
    let highPriority: Bool
    /// Where tapping should land, when it isn't a tmux session — a chat sets
    /// `remy://chat/<id>`.
    var click: String?
}

/// One session's hook-driven state, pushed the instant it changes. Mirrors the
/// server registry, so a nil field means cleared — not "unchanged".
struct SessionPush {
    let serverURL: String
    let session: String
    let agent: AgentKind?
    let state: SessionState?
    let detail: String?
    let currentAction: String?
    let interactionKind: String?
    let interactionRequestId: String?
}

/// One chat's feed and state, pushed as Claude works. A push that carries
/// `state` carries the whole scalar set, so a nil `approval` there means the
/// request was answered rather than "no news".
struct ChatPush {
    let serverURL: String
    let chatId: String
    var entries: [ConversationEntry]?
    var removed: [String]?
    var state: ChatState?
    var action: String?
    var approval: ChatApproval?
    var question: ChatQuestionRequest?
    var todos: [ConversationTodo]?
    var context: ContextUsage?
    var title: String?
    var live: Bool?
    var error: String?
    var updatedAt: TimeInterval?
}

/// Where live updates surface for the rest of the app. Views subscribe to the
/// subjects to repaint immediately, and read `isLive` to decide how hard to
/// poll: a server that pushes needs only a slow safety net, while one that
/// doesn't (an older build) keeps the frequent poll it has always had.
@MainActor
final class PushChannel: ObservableObject {
    static let shared = PushChannel()

    let sessionUpdates = PassthroughSubject<SessionPush, Never>()
    let sessionListChanges = PassthroughSubject<String, Never>()
    let chatUpdates = PassthroughSubject<ChatPush, Never>()
    let chatListChanges = PassthroughSubject<String, Never>()
    @Published private(set) var liveServers: Set<String> = []

    private init() {}

    func isLive(_ serverURL: String) -> Bool { liveServers.contains(serverURL) }

    func markLive(_ serverURL: String) { liveServers.insert(serverURL) }

    func markDown(_ serverURL: String) { liveServers.remove(serverURL) }

    func emit(_ push: SessionPush) { sessionUpdates.send(push) }

    func emitSessionListChange(_ serverURL: String) { sessionListChanges.send(serverURL) }

    func emit(_ push: ChatPush) { chatUpdates.send(push) }

    func emitChatListChange(_ serverURL: String) { chatListChanges.send(serverURL) }
}

// Just enough to tell notify-stream message kinds apart before fully decoding.
private struct WSEnvelope: Decodable {
    let type: String?
}

private struct SessionPushPayload: Decodable {
    let session: String
    let agent: AgentKind?
    let state: SessionState?
    let detail: String?
    let currentAction: String?
    let interactionKind: String?
    let interactionRequestId: String?

    func event(from server: Server) -> SessionPush {
        SessionPush(
            serverURL: server.url,
            session: session,
            agent: agent,
            state: state,
            detail: detail,
            currentAction: currentAction,
            interactionKind: interactionKind,
            interactionRequestId: interactionRequestId
        )
    }
}

private struct QuickRepliesPush: Decodable {
    let replies: [String]
}

private struct ChatPushPayload: Decodable {
    let chatId: String
    var entries: [ConversationEntry]?
    var removed: [String]?
    var state: ChatState?
    var action: String?
    var approval: ChatApproval?
    var question: ChatQuestionRequest?
    var todos: [ConversationTodo]?
    var context: ContextUsage?
    var title: String?
    var live: Bool?
    var error: String?
    var updatedAt: TimeInterval?

    func event(from server: Server) -> ChatPush {
        ChatPush(
            serverURL: server.url,
            chatId: chatId,
            entries: entries,
            removed: removed,
            state: state,
            action: action,
            approval: approval,
            question: question,
            todos: todos,
            context: context,
            title: title,
            live: live,
            error: error,
            updatedAt: updatedAt
        )
    }
}
