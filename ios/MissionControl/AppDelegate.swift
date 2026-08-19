import SwiftUI
import UIKit
import UserNotifications

extension Notification.Name {
    static let flightDeckTitleBarDoubleClicked = Notification.Name("flightDeckTitleBarDoubleClicked")
}

/// On the phone, notifications are delivered by the ntfy app (not this app),
/// and tapping one opens a `remy://session/…` deep link that
/// SessionListView handles — no notification permissions or push token needed.
/// On the Mac (Catalyst) the app itself is the notification target: it shows
/// native banners, which also tells the server to keep the phone quiet.
///
/// Both platforms hold a socket to each server's /notify/stream for live
/// session state; only the Mac asks to receive notifications over it. There's
/// also a launch-arg hook (MC_OPEN=<session>) used to open a session directly
/// for screenshots / UI testing.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    #if targetEnvironment(macCatalyst)
    private var restoredWindowFrame: CGRect?
    #endif

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        if let open = ProcessInfo.processInfo.arguments
            .first(where: { $0.hasPrefix("MC_OPEN=") })?
            .dropFirst("MC_OPEN=".count) {
            DispatchQueue.main.async { AppRouter.shared.openSession = String(open) }
        }

        // Keep UIKit's idea of the appearance the same as the app's.
        //
        // `MCColor` is built on `UIColor(dynamicProvider:)`, which resolves
        // against the UIKit trait collection — not SwiftUI's environment. And
        // `.preferredColorScheme(.dark)` only covers the presentation it is
        // attached to: a sheet is its own presentation and does not inherit it.
        // This app has 33 sheet presentations and none of their content views
        // set it, so every one of them resolved the *light* tokens while the
        // window behind stayed dark. It never showed before the token layer
        // because the old palettes were fixed `Color(red:green:blue:)` values
        // that ignored the appearance entirely.
        //
        // Forcing the style on the window fixes all of them at once, and also
        // makes UIKit-supplied colours (`.secondaryLabel` in the palette's
        // field) agree. Deleting these two lines plus the `preferredColorScheme`
        // calls is what enabling light mode looks like later.
        applyForcedDarkAppearance()
        NotificationCenter.default.addObserver(
            forName: UIWindow.didBecomeVisibleNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.applyForcedDarkAppearance()
        }
        #if targetEnvironment(macCatalyst)
        // Catalyst centres a navigation title in the remaining toolbar area,
        // which shifts it to the right when a split-view sidebar is present.
        // The SwiftUI root provides an app-owned, truly centred replacement.
        NotificationCenter.default.addObserver(
            forName: UIScene.willConnectNotification,
            object: nil,
            queue: .main
        ) { notification in
            guard let scene = notification.object as? UIWindowScene else { return }
            scene.titlebar?.titleVisibility = .hidden
        }
        DispatchQueue.main.async {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .forEach {
                    $0.titlebar?.titleVisibility = .hidden
                }
        }
        UNUserNotificationCenter.current().delegate = self
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleFlightDeckTitleBarDoubleClick),
            name: .flightDeckTitleBarDoubleClicked,
            object: nil
        )
        NotifyStreamManager.shared.activate(presentingNotifications: true)
        #else
        // Live state only — the phone's banners come from ntfy, and asking for
        // notification permission it never uses would be a prompt for nothing.
        NotifyStreamManager.shared.activate(presentingNotifications: false)
        #endif
        return true
    }

    /// Applied to every window, on launch and whenever one becomes visible, so a
    /// window created later (a new scene, a separately-windowed presentation)
    /// cannot come up in the system appearance.
    private func applyForcedDarkAppearance() {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .forEach { $0.overrideUserInterfaceStyle = .dark }
    }

    #if targetEnvironment(macCatalyst)
    @objc private func handleFlightDeckTitleBarDoubleClick() {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first else { return }

        // Catalyst has no public `zoom` action, but its geometry API preserves
        // the native window animation and lets macOS clamp to the visible frame.
        let currentFrame = scene.effectiveGeometry.systemFrame
        let screenFrame = scene.screen.bounds
        let targetFrame: CGRect
        if let restoredWindowFrame,
           currentFrame.width > restoredWindowFrame.width + 20 {
            targetFrame = restoredWindowFrame
            self.restoredWindowFrame = nil
        } else if currentFrame.width >= screenFrame.width - 24 {
            let width = min(1180, screenFrame.width - 80)
            let height = min(800, screenFrame.height - 80)
            targetFrame = CGRect(
                x: screenFrame.midX - width / 2,
                y: screenFrame.midY - height / 2,
                width: width,
                height: height
            )
        } else {
            restoredWindowFrame = currentFrame
            targetFrame = screenFrame
        }
        scene.requestGeometryUpdate(
            UIWindowScene.GeometryPreferences.Mac(systemFrame: targetFrame),
            errorHandler: { _ in }
        )
    }
    #endif

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
        let info = response.notification.request.content.userInfo
        // A chat's banner names its own destination; a session's is implied by
        // the session name, which is how every older server reports it.
        if let click = info["click"] as? String,
           let url = URL(string: click),
           url.host == "chat",
           let id = url.pathComponents.dropFirst().first {
            await MainActor.run { AppRouter.shared.openChat = id }
            return
        }
        if let session = info["session"] as? String {
            await MainActor.run { AppRouter.shared.openSession = session }
        }
    }
}
