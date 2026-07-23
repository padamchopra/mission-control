import SwiftUI

@main
struct MissionControlApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var router = AppRouter.shared
    @StateObject private var servers = ServerStore.shared
    @StateObject private var toasts = ToastCenter.shared

    var body: some Scene {
        WindowGroup {
            SessionListView()
                .environmentObject(router)
                .environmentObject(servers)
                .environmentObject(toasts)
                .preferredColorScheme(.dark)
        }
        .commands {
            CommandMenu("Navigate") {
                Button("Back") {
                    router.goBack()
                }
                .keyboardShortcut("[", modifiers: .command)

                Button("Forward") {
                    router.goForward()
                }
                .keyboardShortcut("]", modifiers: .command)

                Divider()

                Button("Quick Open…") {
                    router.showCommandPalette()
                }
                .keyboardShortcut("k", modifiers: .command)
            }

            CommandMenu("View") {
                Button("Toggle Sidebar") {
                    router.toggleSidebar()
                }
                .keyboardShortcut("s", modifiers: [.command, .option])
            }
        }
    }
}
