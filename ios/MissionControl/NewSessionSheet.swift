import SwiftUI

/// Start a new tmux session from anywhere — in a chosen directory (or home),
/// optionally launching Claude — without needing a saved workspace first.
struct NewSessionSheet: View {
    let workspaces: [Workspace]
    let api: APIClient?
    var onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var toasts: ToastCenter
    @State private var name = ""
    @State private var path = ""
    @State private var launchClaude = true
    @State private var creating = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Directory — blank for home", text: $path)
                        .font(.callout.monospaced())
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    if !workspaces.isEmpty {
                        Menu {
                            ForEach(workspaces) { workspace in
                                Button(workspace.name) { path = workspace.path }
                            }
                        } label: {
                            Label("Use a repository…", systemImage: "folder")
                        }
                    }
                } header: {
                    Text("Where")
                } footer: {
                    Text("Leave blank to start in your home directory on the server.")
                }
                Section {
                    TextField("Name — optional", text: $name)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Toggle("Launch Claude", isOn: $launchClaude)
                }
            }
            .navigationTitle("New session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if creating {
                        ProgressView()
                    } else {
                        Button("Create") { create() }
                    }
                }
            }
        }
    }

    private func create() {
        guard let api else { return }
        creating = true
        let chosenName = name
        let chosenPath = path
        let claude = launchClaude
        Task {
            do {
                let created = try await api.createSession(
                    name: chosenName.isEmpty ? nil : chosenName,
                    path: chosenPath.isEmpty ? nil : chosenPath,
                    claude: claude
                )
                toasts.show(.success, created.isEmpty ? "Session started" : "Started \(created)")
                dismiss()
                if !created.isEmpty { onCreated(created) }
            } catch {
                toasts.show(.error, "Couldn't start the session. Check the name and directory.")
                creating = false
            }
        }
    }
}
