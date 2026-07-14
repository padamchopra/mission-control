import Combine
import Foundation
import UserNotifications

/// Desktop (Mac Catalyst) only: holds a WebSocket to every configured server's
/// /notify/stream while the app runs. The server routes Claude notifications to
/// these sockets — shown here as native banners — instead of ntfy, so the phone
/// stays quiet whenever a desktop client is open. Reconnects patiently forever:
/// the open socket itself is the presence signal.
final class NotifyStreamManager: NSObject {
    static let shared = NotifyStreamManager()

    private var streams: [String: Task<Void, Never>] = [:]
    private var serversSubscription: AnyCancellable?

    func activate() {
        guard serversSubscription == nil else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        serversSubscription = ServerStore.shared.$servers
            .receive(on: DispatchQueue.main)
            .sink { [weak self] servers in self?.restart(servers) }
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
                await receiveLoop(socket)
                socket.cancel(with: .goingAway, reason: nil)
            }
            try? await Task.sleep(for: .seconds(20))
        }
    }

    private func openSocket(_ server: Server) -> URLSessionWebSocketTask? {
        guard let api = APIClient(urlString: server.url, token: server.token),
              let url = api.notifyWebSocketURL() else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(server.token)", forHTTPHeaderField: "Authorization")
        let socket = URLSession.shared.webSocketTask(with: request)
        socket.resume()
        return socket
    }

    private func receiveLoop(_ socket: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            guard let message = try? await socket.receive() else { return }
            let data: Data?
            switch message {
            case .string(let text): data = text.data(using: .utf8)
            case .data(let raw): data = raw
            @unknown default: data = nil
            }
            if let data, let event = try? JSONDecoder().decode(NotifyEvent.self, from: data) {
                await post(event)
            }
        }
    }

    private func post(_ event: NotifyEvent) async {
        let content = UNMutableNotificationContent()
        content.title = event.title
        content.body = event.message
        content.sound = event.highPriority ? .default : nil
        content.userInfo = ["session": event.session]
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }
}

struct NotifyEvent: Codable {
    let session: String
    let title: String
    let message: String
    let highPriority: Bool
}
