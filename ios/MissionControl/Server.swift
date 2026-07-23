import Foundation
import SwiftUI

struct Server: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var url: String
    var token: String

    static func defaultName(for url: String) -> String {
        guard let host = URLComponents(string: url)?.host else { return "Server" }
        return host.split(separator: ".").first.map(String.init) ?? host
    }
}

/// Holds the set of configured servers and which one is active. The active
/// server's url/token are mirrored into the "serverURL"/"serverToken" defaults,
/// so every screen that talks to a server just reads the active connection.
final class ServerStore: ObservableObject {
    static let shared = ServerStore()

    @Published private(set) var servers: [Server]
    @Published var activeID: String? {
        didSet { persist(); syncActive() }
    }

    private let serversKey = "servers"
    private let activeKey = "activeServerID"

    private init() {
        let defaults = UserDefaults.standard
        let savedServers = (defaults.data(forKey: serversKey))
            .flatMap { try? JSONDecoder().decode([Server].self, from: $0) } ?? []
        // ServerStore replaced the original single-server settings. Preserve
        // existing installations by importing those values before syncActive
        // has a chance to clear them for an empty server list.
        if savedServers.isEmpty,
           let url = defaults.string(forKey: "serverURL"), !url.isEmpty,
           let token = defaults.string(forKey: "serverToken"), !token.isEmpty {
            servers = [Server(
                id: UUID().uuidString,
                name: Server.defaultName(for: url),
                url: url,
                token: token
            )]
        } else {
            servers = savedServers
        }
        activeID = defaults.string(forKey: activeKey) ?? servers.first?.id
        if activeID == nil || !servers.contains(where: { $0.id == activeID }) {
            activeID = servers.first?.id
        }
        persist()
        syncActive()
    }

    var active: Server? {
        servers.first { $0.id == activeID }
    }

    /// Adds a server (or updates the token if the URL already exists) and makes
    /// it active. Returns the server.
    @discardableResult
    func addOrUpdate(url: String, token: String, name: String? = nil) -> Server {
        if let index = servers.firstIndex(where: { $0.url == url }) {
            servers[index].token = token
            if let name { servers[index].name = name }
            activeID = servers[index].id
            persist()
            return servers[index]
        }
        let server = Server(id: UUID().uuidString, name: name ?? Server.defaultName(for: url), url: url, token: token)
        servers.append(server)
        activeID = server.id
        persist()
        return server
    }

    func remove(_ id: String) {
        servers.removeAll { $0.id == id }
        if activeID == id { activeID = servers.first?.id }
        persist()
        syncActive()
    }

    func rename(_ id: String, to name: String) {
        guard let index = servers.firstIndex(where: { $0.id == id }) else { return }
        servers[index].name = name
        persist()
    }

    private func persist() {
        let defaults = UserDefaults.standard
        defaults.set(try? JSONEncoder().encode(servers), forKey: serversKey)
        defaults.set(activeID, forKey: activeKey)
    }

    private func syncActive() {
        let defaults = UserDefaults.standard
        if let active {
            defaults.set(active.url, forKey: "serverURL")
            defaults.set(active.token, forKey: "serverToken")
        } else {
            defaults.removeObject(forKey: "serverURL")
            defaults.removeObject(forKey: "serverToken")
        }
    }
}
