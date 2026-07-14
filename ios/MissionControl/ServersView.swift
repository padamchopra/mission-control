import AVFoundation
import SwiftUI

struct ServersView: View {
    @EnvironmentObject private var store: ServerStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage("linkRefreshSeconds") private var linkRefreshSeconds = 60
    @State private var showScanner = false
    @State private var showManualAdd = false
    @State private var cameraDenied = false
    @State private var pasteFailed = false
    @State private var renaming: Server?
    @State private var renameText = ""

    var body: some View {
        NavigationStack {
            List {
                if store.servers.isEmpty {
                    Text("No servers yet. Add one by scanning the pairing QR your Mac's setup script prints.")
                        .foregroundStyle(.secondary)
                }
                ForEach(store.servers) { server in
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
                        Button { renaming = server; renameText = server.name } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        .tint(.gray)
                    }
                }
                Section {
                    Picker("PR link refresh", selection: $linkRefreshSeconds) {
                        Text("Off").tag(0)
                        Text("1 min").tag(60)
                        Text("5 min").tag(300)
                        Text("15 min").tag(900)
                    }
                } header: {
                    Text("Settings")
                } footer: {
                    Text("How often an open session re-checks for its pull request link. Off checks once when the session opens.")
                }
            }
            .navigationTitle("Servers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        // Scanning a QR shown on this same machine makes no
                        // sense on the Mac — there, paste the pairing link.
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
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
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
