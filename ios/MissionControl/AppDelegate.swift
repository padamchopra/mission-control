import SwiftUI
import UIKit
import UserNotifications

/// Owns APNs: requests authorization, registers the device token with the
/// server, routes notification taps to a session, and handles the Yes/No
/// quick actions on a "needs input" notification.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static let needsInputCategory = "NEEDS_INPUT"

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        let yes = UNNotificationAction(identifier: "YES", title: "Yes (1)", options: [])
        let no = UNNotificationAction(identifier: "NO", title: "No (3)", options: [.destructive])
        center.setNotificationCategories([
            UNNotificationCategory(
                identifier: Self.needsInputCategory,
                actions: [yes, no],
                intentIdentifiers: [],
                options: []
            )
        ])

        // MC_NO_PUSH_PROMPT skips the authorization prompt; MC_OPEN=<session>
        // auto-navigates on launch — both are for screenshots/UI testing only.
        let args = ProcessInfo.processInfo.arguments
        if !args.contains("MC_NO_PUSH_PROMPT") {
            center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                guard granted else { return }
                DispatchQueue.main.async { application.registerForRemoteNotifications() }
            }
        }
        if let open = args.first(where: { $0.hasPrefix("MC_OPEN=") })?.dropFirst("MC_OPEN=".count) {
            DispatchQueue.main.async { AppRouter.shared.openSession = String(open) }
        }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { try? await api()?.registerDevice(token: token) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // No token → notifications simply won't arrive; nothing else to do.
    }

    // Show notifications even while the app is in the foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let session = response.notification.request.content.userInfo["session"] as? String
        switch response.actionIdentifier {
        case "YES", "NO":
            if let session {
                let key = response.actionIdentifier == "YES" ? "1" : "3"
                Task {
                    try? await api()?.sendKeys(session, keys: [key])
                    completionHandler()
                }
                return
            }
        default:
            if let session {
                DispatchQueue.main.async { AppRouter.shared.openSession = session }
            }
        }
        completionHandler()
    }

    private func api() -> APIClient? {
        let defaults = UserDefaults.standard
        return APIClient(
            urlString: defaults.string(forKey: "serverURL") ?? "",
            token: defaults.string(forKey: "serverToken") ?? ""
        )
    }
}
