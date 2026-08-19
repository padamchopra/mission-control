import Foundation

/// Payload encoded in the pairing QR / deep link:
/// `remy://configure?url=<server>&token=<token>`
/// Older `missioncontrol://` links still pair.
struct PairingConfig {
    let url: String
    let token: String

    init(url: String, token: String) {
        self.url = url
        self.token = token
    }

    init?(from url: URL) {
        guard let scheme = url.scheme, ["remy", "missioncontrol"].contains(scheme),
              url.host == "configure",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let server = items.first(where: { $0.name == "url" })?.value, !server.isEmpty,
              let token = items.first(where: { $0.name == "token" })?.value, !token.isEmpty else {
            return nil
        }
        self.url = server
        self.token = token
    }

    init?(fromString string: String) {
        guard let url = URL(string: string) else { return nil }
        self.init(from: url)
    }

    var pairingURL: URL? {
        var components = URLComponents()
        components.scheme = "remy"
        components.host = "configure"
        components.queryItems = [
            URLQueryItem(name: "url", value: url),
            URLQueryItem(name: "token", value: token)
        ]
        return components.url
    }

    var pairingLink: String {
        pairingURL?.absoluteString ?? ""
    }
}

extension Server {
    var pairingLink: String {
        PairingConfig(url: url, token: token).pairingLink
    }
}
