import SwiftUI

@main
struct MissionControlApp: App {
    var body: some Scene {
        WindowGroup {
            SessionListView()
                .preferredColorScheme(.dark)
        }
    }
}
