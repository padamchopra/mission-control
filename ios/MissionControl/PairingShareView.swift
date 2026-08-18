import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

struct PairingQRCodeView: View {
    let pairingLink: String
    var accessibilityName = "this connection"

    var body: some View {
        Group {
            if let image = PairingQRCodeRenderer.image(for: pairingLink) {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.none)
            } else {
                Image(systemName: "qrcode")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(MCColor.mutedForeground)
                    .padding(44)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .padding(14)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: MCRadius.xxxl, style: .continuous))
        .accessibilityLabel("Pairing QR code for \(accessibilityName)")
    }
}

struct PairingShareSheet: View {
    let server: Server

    @Environment(\.dismiss) private var dismiss
    @State private var copied = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    PairingQRCodeView(
                        pairingLink: server.pairingLink,
                        accessibilityName: server.name
                    )
                    .frame(width: 236, height: 236)

                    VStack(spacing: 6) {
                        Text(server.name)
                            .font(.title3.weight(.semibold))
                        Text(server.url)
                            .font(.caption.monospaced())
                            .foregroundStyle(MCColor.mutedForeground)
                            .multilineTextAlignment(.center)
                            .textSelection(.enabled)
                    }

                    Label(
                        "Anyone with this QR code or link can connect to this server. Only share it with a device you trust.",
                        systemImage: "lock.shield"
                    )
                    .font(.callout)
                    .foregroundStyle(MCColor.mutedForeground)
                    .padding(16)
                    .frame(maxWidth: 420, alignment: .leading)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))

                    Button(action: copyPairingLink) {
                        Label(
                            copied ? "Pairing link copied" : "Copy pairing link",
                            systemImage: copied ? "checkmark" : "doc.on.doc"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .frame(maxWidth: 420)
                    .disabled(server.pairingLink.isEmpty)
                }
                .padding(24)
                .frame(maxWidth: .infinity)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Share device setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func copyPairingLink() {
        UIPasteboard.general.string = server.pairingLink
        copied = true
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            copied = false
        }
    }
}

private enum PairingQRCodeRenderer {
    private static let context = CIContext()

    static func image(for value: String) -> UIImage? {
        guard !value.isEmpty else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
