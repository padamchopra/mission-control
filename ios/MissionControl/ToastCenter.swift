import SwiftUI

@MainActor
final class ToastCenter: ObservableObject {
    enum Kind {
        case success
        case info
        case error

        var color: Color {
            switch self {
            case .success: return .green
            case .info: return .blue
            case .error: return .red
            }
        }

        var icon: String {
            switch self {
            case .success: return "checkmark.circle.fill"
            case .info: return "info.circle.fill"
            case .error: return "exclamationmark.triangle.fill"
            }
        }
    }

    struct Item: Identifiable {
        let id = UUID()
        let kind: Kind
        let message: String
    }

    static let shared = ToastCenter()
    @Published private(set) var items: [Item] = []

    func show(_ kind: Kind, _ message: String, duration: TimeInterval = 3) {
        let item = Item(kind: kind, message: message)
        items.append(item)
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            self?.items.removeAll { $0.id == item.id }
        }
    }
}

struct ToastOverlay: View {
    @EnvironmentObject private var toasts: ToastCenter

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            ForEach(toasts.items) { item in
                HStack(spacing: 9) {
                    Image(systemName: item.kind.icon)
                        .foregroundStyle(item.kind.color)
                    Text(item.message)
                        .font(.callout)
                        .lineLimit(2)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                .overlay {
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(item.kind.color.opacity(0.35), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.2), radius: 12, y: 5)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: toasts.items.map(\.id))
        .accessibilityElement(children: .contain)
    }
}
