import SwiftUI

/// Kick off a whole new task from anywhere: describe it, and the server creates
/// a fresh branch + linked worktree + tmux session with Claude launched and the
/// task delivered as its first message.
struct TaskLauncherSheet: View {
    let workspace: Workspace
    let api: APIClient?
    var onLaunched: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toasts: ToastCenter
    @State private var prompt = ""
    @State private var launching = false
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Describe the task for Claude…", text: $prompt, axis: .vertical)
                        .lineLimit(3 ... 8)
                        .focused($focused)
                        .autocorrectionDisabled()
                } header: {
                    Text("New task in \(workspace.name)")
                } footer: {
                    Text("Creates a new branch and linked worktree, opens a tmux session, and launches Claude with this as its first message.")
                }
            }
            .navigationTitle("Start a task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if launching {
                        ProgressView()
                    } else {
                        Button("Launch") { launch() }
                            .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .onAppear { focused = true }
        }
    }

    private func launch() {
        guard let api else { return }
        launching = true
        let text = prompt
        Task {
            do {
                let name = try await api.createTask(workspaceID: workspace.id, prompt: text)
                toasts.show(.success, name.isEmpty ? "Task started" : "Started \(name)")
                dismiss()
                if !name.isEmpty { onLaunched(name) }
            } catch {
                toasts.show(.error, "Couldn't start the task. Check the repository on the server.")
                launching = false
            }
        }
    }
}
