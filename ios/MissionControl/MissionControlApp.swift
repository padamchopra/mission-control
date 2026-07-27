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
    // Started at launch so the decision badge is accurate before the queue is
    // ever opened — including for servers the fleet list isn't showing.
    @StateObject private var inbox = InboxStore.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            SessionListView()
                .environmentObject(router)
                .environmentObject(servers)
                .environmentObject(toasts)
                .preferredColorScheme(.dark)
                .task { inbox.activate() }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task { await quickReplies.refresh() }
                    inbox.requestRefresh()
                    // iOS suspends the app and the push socket dies with it.
                    // Re-open it now rather than waiting out the reconnect
                    // backoff, which would leave the first seconds back in the
                    // app running on stale state. The Mac keeps its socket.
                    #if !targetEnvironment(macCatalyst)
                    NotifyStreamManager.shared.reconnectNow()
                    #endif
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

                Button("Decisions…") {
                    router.showInbox()
                }
                .keyboardShortcut("d", modifiers: [.command, .shift])
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
