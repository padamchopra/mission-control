import Foundation

/// Payload encoded in the pairing QR / deep link:
/// `missioncontrol://configure?url=<server>&token=<token>`
struct PairingConfig {
    let url: String
    let token: String

    init?(from url: URL) {
        guard url.scheme == "missioncontrol", url.host == "configure",
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
}
