import SwiftUI
import UIKit

/// Notifications are delivered by the ntfy app (not this app), and tapping one
/// opens a `missioncontrol://session/…` deep link that SessionListView handles —
/// so this app requests no notification permissions and registers no push token.
/// The only thing here is a launch-arg hook (MC_OPEN=<session>) used to open a
/// session directly for screenshots / UI testing.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        if let open = ProcessInfo.processInfo.arguments
            .first(where: { $0.hasPrefix("MC_OPEN=") })?
            .dropFirst("MC_OPEN=".count) {
            DispatchQueue.main.async { AppRouter.shared.openSession = String(open) }
        }
        return true
    }
}
