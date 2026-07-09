import AVFoundation
import SwiftUI

struct SettingsView: View {
    @AppStorage("serverURL") private var serverURL = "http://127.0.0.1:8420"
    @AppStorage("serverToken") private var serverToken = ""
    @Environment(\.dismiss) private var dismiss
    @State private var testResult: String?
    @State private var showScanner = false
    @State private var cameraDenied = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        requestScanner()
                    } label: {
                        Label("Scan pairing QR", systemImage: "qrcode.viewfinder")
                    }
                } footer: {
                    Text("Run the setup script on the mini and scan the QR it prints.")
                }
                Section("Server") {
                    TextField("https://mini.tailnet.ts.net", text: $serverURL)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    SecureField("Token", text: $serverToken)
                }
                Section {
                    Button("Test connection") {
                        Task { await testConnection() }
                    }
                    if let testResult {
                        Text(testResult)
                            .font(.callout)
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showScanner) {
                scannerSheet
            }
            .alert("Camera access needed", isPresented: $cameraDenied) {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Enable camera access in Settings to scan the pairing QR.")
            }
        }
    }

    private var scannerSheet: some View {
        NavigationStack {
            QRScannerView { value in
                if let config = PairingConfig(fromString: value) {
                    serverURL = config.url
                    serverToken = config.token
                    testResult = "✅ Paired via QR"
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

    private func requestScanner() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            showScanner = true
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if granted { showScanner = true } else { cameraDenied = true }
                }
            }
        default:
            cameraDenied = true
        }
    }

    private func testConnection() async {
        guard let api = APIClient(urlString: serverURL, token: serverToken) else {
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
