import SwiftUI

/// Shared navigation intent set by push taps / deep links and observed by the
/// session list, which pushes the requested session.
final class AppRouter: ObservableObject {
    static let shared = AppRouter()
    @Published var openSession: String?
}
