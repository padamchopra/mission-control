import SwiftUI

@main
struct MissionControlApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var router = AppRouter.shared
    @StateObject private var servers = ServerStore.shared

    var body: some Scene {
        WindowGroup {
            SessionListView()
                .environmentObject(router)
                .environmentObject(servers)
                .preferredColorScheme(.dark)
        }
    }
}
