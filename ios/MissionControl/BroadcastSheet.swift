import SwiftUI

/// Send one message to many sessions at once — "commit and push", "run lint" —
/// to all of them or just those in a given state.
struct BroadcastSheet: View {
    let sessions: [TmuxSession]
    let api: APIClient?

    enum Target: String, CaseIterable, Identifiable {
        case all = "All"
        case needsInput = "Needs input"
        case working = "Working"
        var id: String { rawValue }
    }

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toasts: ToastCenter
    @State private var message = ""
    @State private var target: Target = .all
    @State private var sending = false
    @FocusState private var focused: Bool

    private var recipients: [TmuxSession] {
        switch target {
        case .all: return sessions
        case .needsInput: return sessions.filter { $0.resolvedState == .needsInput }
        case .working: return sessions.filter { $0.resolvedState == .working }
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Message to send to every matching session…", text: $message, axis: .vertical)
                        .lineLimit(2 ... 6)
                        .focused($focused)
                }
                Section("Send to") {
                    Picker("Target", selection: $target) {
                        ForEach(Target.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Text("\(recipients.count) session\(recipients.count == 1 ? "" : "s") will receive this.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Broadcast")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if sending {
                        ProgressView()
                    } else {
                        Button("Send") { send() }
                            .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || recipients.isEmpty)
                    }
                }
            }
            .onAppear { focused = true }
        }
    }

    private func send() {
        guard let api else { return }
        sending = true
        let text = message
        let targets = recipients
        Task {
            var delivered = 0
            for session in targets {
                if (try? await api.sendText(session.name, text: text)) != nil { delivered += 1 }
            }
            toasts.show(delivered == targets.count ? .success : .error, "Sent to \(delivered) of \(targets.count)")
            dismiss()
        }
    }
}
