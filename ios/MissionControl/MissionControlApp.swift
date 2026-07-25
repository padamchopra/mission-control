import SwiftUI

@main
struct MissionControlApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var router = AppRouter.shared
    @StateObject private var servers = ServerStore.shared
    @StateObject private var toasts = ToastCenter.shared
    // Instantiated at launch so it observes the active server and does an initial
    // fetch before the composer's quick-reply menu is first opened.
    @StateObject private var quickReplies = QuickRepliesStore.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            SessionListView()
                .environmentObject(router)
                .environmentObject(servers)
                .environmentObject(toasts)
                .preferredColorScheme(.dark)
                // The phone doesn't hold the notify socket (that's desktop-only),
                // so pull the latest quick replies whenever it returns to front.
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await quickReplies.refresh() } }
                }
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
