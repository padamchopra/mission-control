import SwiftUI

@main
struct MissionControlApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var router = AppRouter.shared

    var body: some Scene {
        WindowGroup {
            SessionListView()
                .environmentObject(router)
                .preferredColorScheme(.dark)
        }
    }
}
