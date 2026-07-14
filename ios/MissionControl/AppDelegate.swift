import SwiftUI
import UIKit
import UserNotifications

/// On the phone, notifications are delivered by the ntfy app (not this app),
/// and tapping one opens a `missioncontrol://session/…` deep link that
/// SessionListView handles — no notification permissions or push token needed.
/// On the Mac (Catalyst) the app itself is the notification target: it holds a
/// socket to each server's /notify/stream and shows native banners, which also
/// tells the server to keep the phone quiet. There's also a launch-arg hook
/// (MC_OPEN=<session>) used to open a session directly for screenshots / UI
/// testing.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        if let open = ProcessInfo.processInfo.arguments
            .first(where: { $0.hasPrefix("MC_OPEN=") })?
            .dropFirst("MC_OPEN=".count) {
            DispatchQueue.main.async { AppRouter.shared.openSession = String(open) }
        }
        #if targetEnvironment(macCatalyst)
        UNUserNotificationCenter.current().delegate = self
        NotifyStreamManager.shared.activate()
        #endif
        return true
    }

    // Notifications arrive over the notify stream only while the app is
    // running — show them as banners even when the window is frontmost.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        if let session = response.notification.request.content.userInfo["session"] as? String {
            await MainActor.run { AppRouter.shared.openSession = session }
        }
    }
}
