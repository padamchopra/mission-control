import AVFoundation
import SwiftUI

struct ServersView: View {
    @EnvironmentObject private var store: ServerStore
    @EnvironmentObject private var toasts: ToastCenter
    @Environment(\.dismiss) private var dismiss
    @AppStorage("serverURL") private var serverURL = "http://127.0.0.1:8420"
    @AppStorage("serverToken") private var serverToken = ""
    @State private var showScanner = false
    @State private var showManualAdd = false
    @State private var cameraDenied = false
    @State private var pasteFailed = false
    @State private var renaming: Server?
    @State private var renameText = ""
    @State private var showUpdateConfirmation = false
    @State private var isUpdatingServer = false

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    var body: some View {
        NavigationStack {
            List {
                serverListContent
                maintenanceSection
            }
            .navigationTitle("Servers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Separate toolbar items prevent Catalyst from putting both
                // individually glassed controls inside one outer group.
                ToolbarItem(placement: .topBarTrailing) {
                    addServerMenu
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .liquidGlass(in: Capsule())
                        .buttonStyle(.plain)
                }
            }
            .sheet(isPresented: $showScanner) {
                scannerSheet
            }
            .sheet(isPresented: $showManualAdd) {
                ManualServerForm { name, url, token in
                    store.addOrUpdate(url: url, token: token, name: name)
                }
            }
            .alert("Rename server", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
                TextField("Name", text: $renameText)
                Button("Save") { if let r = renaming { store.rename(r.id, to: renameText) } }
                Button("Cancel", role: .cancel) {}
            }
            .alert("Camera access needed", isPresented: $cameraDenied) {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Enable camera access in Settings to scan the pairing QR.")
            }
            .alert("No pairing link found", isPresented: $pasteFailed) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Copy the missioncontrol://configure link printed by the setup script, then try again.")
            }
            .confirmationDialog("Update server?", isPresented: $showUpdateConfirmation) {
                Button("Pull and install update") {
                    Task { await updateServer() }
                }
            } message: {
                Text("This pulls the server's current branch, installs dependencies, builds it, and restarts the service.")
            }
        }
    }

    private var addServerMenu: some View {
        Menu {
            // Scanning a QR shown on this same machine makes no sense on the
            // Mac — there, paste the pairing link.
            #if !targetEnvironment(macCatalyst)
            Button {
                requestScanner()
            } label: {
                Label("Scan pairing QR", systemImage: "qrcode.viewfinder")
            }
            #endif
            Button {
                pastePairingLink()
            } label: {
                Label("Paste pairing link", systemImage: "doc.on.clipboard")
            }
            Button {
                showManualAdd = true
            } label: {
                Label("Enter manually", systemImage: "keyboard")
            }
        } label: {
            Image(systemName: "plus")
                .font(.body.weight(.semibold))
                .frame(width: 36, height: 36)
                .liquidGlass(in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add server")
    }

    @ViewBuilder
    private var serverListContent: some View {
        if store.servers.isEmpty {
            Text("No servers yet. Add one by scanning the pairing QR your Mac's setup script prints.")
                .foregroundStyle(.secondary)
        }
        ForEach(store.servers) { server in
            serverRow(server)
        }
    }

    private var maintenanceSection: some View {
        Section {
            Button {
                showUpdateConfirmation = true
            } label: {
                HStack {
                    Label("Update server", systemImage: "arrow.triangle.2.circlepath")
                    Spacer()
                    if isUpdatingServer { ProgressView().controlSize(.small) }
                }
            }
            .disabled(api == nil || isUpdatingServer)
        } header: {
            Text("Server maintenance")
        } footer: {
            Text("Pulls the server's current git branch, installs dependencies, builds, then restarts the server. Running sessions are preserved by tmux.")
        }
    }

    private func serverRow(_ server: Server) -> some View {
        Button {
            store.activeID = server.id
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(server.name).foregroundStyle(.primary)
                    Text(server.url).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if server.id == store.activeID {
                    Image(systemName: "checkmark").foregroundStyle(.tint)
                }
            }
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { store.remove(server.id) } label: {
                Label("Remove", systemImage: "trash")
            }
            Button {
                renaming = server
                renameText = server.name
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            .tint(.gray)
        }
    }

    private var scannerSheet: some View {
        NavigationStack {
            QRScannerView { value in
                if let config = PairingConfig(fromString: value) {
                    store.addOrUpdate(url: config.url, token: config.token)
                }
                showScanner = false
            }
            .ignoresSafeArea()
            .navigationTitle("Scan QR")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showScanner = false }
                }
            }
        }
    }

    private func pastePairingLink() {
        let text = UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if let config = PairingConfig(fromString: text) {
            store.addOrUpdate(url: config.url, token: config.token)
        } else {
            pasteFailed = true
        }
    }

    private func requestScanner() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            showScanner = true
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async { granted ? (showScanner = true) : (cameraDenied = true) }
            }
        default:
            cameraDenied = true
        }
    }

    private func updateServer() async {
        guard let api else { return }
        isUpdatingServer = true
        defer { isUpdatingServer = false }
        do {
            let started = try await api.startServerUpdate()
            toasts.show(.info, started.message)
            for _ in 0..<45 {
                try? await Task.sleep(for: .seconds(2))
                guard let status = try? await api.serverUpdateStatus() else { continue }
                switch status.state {
                case "succeeded":
                    toasts.show(.success, status.message)
                    return
                case "failed":
                    toasts.show(.error, status.message)
                    return
                default:
                    continue
                }
            }
            toasts.show(.info, "Update is still running. Check server settings again shortly.")
        } catch {
            toasts.show(.error, "Couldn't start the server update: \(error.localizedDescription)")
        }
    }
}

private struct ManualServerForm: View {
    var onAdd: (String, String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var url = ""
    @State private var token = ""
    @State private var testResult: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Name (optional)", text: $name)
                        .autocorrectionDisabled()
                    TextField("https://your-mac.tailnet.ts.net", text: $url)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    SecureField("Token", text: $token)
                }
                Section {
                    Button("Test connection") {
                        Task { await test() }
                    }
                    if let testResult {
                        Text(testResult).font(.callout)
                    }
                }
            }
            .navigationTitle("Add server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        onAdd(name.isEmpty ? Server.defaultName(for: url) : name, url, token)
                        dismiss()
                    }
                    .disabled(url.isEmpty || token.isEmpty)
                }
            }
        }
    }

    private func test() async {
        guard let api = APIClient(urlString: url, token: token) else {
            testResult = "❌ Invalid URL or empty token"
            return
        }
        do {
            try await api.health()
            testResult = "✅ Connected"
        } catch {
            testResult = "❌ \(error.localizedDescription)"
        }
    }
}
