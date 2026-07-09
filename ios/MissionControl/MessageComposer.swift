import PhotosUI
import SwiftUI

struct MessageComposer: View {
    let sessionName: String

    @AppStorage("serverURL") private var serverURL = "http://127.0.0.1:8420"
    @AppStorage("serverToken") private var serverToken = ""

    @State private var text = ""
    @State private var textHeight: CGFloat = 34
    @State private var attachments: [Attachment] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var sending = false
    @State private var errorText: String?

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty
    }

    var body: some View {
        VStack(spacing: 8) {
            if let errorText {
                Text(errorText)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !attachments.isEmpty {
                attachmentChips
            }
            HStack(alignment: .bottom, spacing: 8) {
                attachMenu
                inputField
                sendButton
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.black)
        .photosPicker(isPresented: photosPresentedBinding, selection: $pickerItems, matching: .any(of: [.images, .videos]))
        .onChange(of: pickerItems) { _, items in
            Task { await loadPickedItems(items) }
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in addImages([image]) }
                .ignoresSafeArea()
        }
    }

    @State private var photosPresented = false
    private var photosPresentedBinding: Binding<Bool> {
        Binding(get: { photosPresented }, set: { photosPresented = $0 })
    }

    private var attachmentChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(attachments) { attachment in
                    attachmentChip(attachment)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func attachmentChip(_ attachment: Attachment) -> some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let thumbnail = attachment.thumbnail {
                    Image(uiImage: thumbnail)
                        .resizable()
                        .scaledToFill()
                } else {
                    Image(systemName: attachment.isVideo ? "film" : "doc")
                        .font(.title2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .foregroundStyle(.white)
                        .background(Color(.systemGray4))
                }
            }
            .frame(width: 58, height: 58)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Button {
                attachments.removeAll { $0.id == attachment.id }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(.white, .black.opacity(0.6))
            }
            .buttonStyle(.plain)
            .padding(2)
        }
    }

    private var attachMenu: some View {
        Menu {
            Button {
                photosPresented = true
            } label: {
                Label("Photo Library", systemImage: "photo.on.rectangle")
            }
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button {
                    showCamera = true
                } label: {
                    Label("Take Photo", systemImage: "camera")
                }
            }
        } label: {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 30))
                .foregroundStyle(.secondary)
        }
        .frame(height: 34)
    }

    private var inputField: some View {
        ZStack(alignment: .topLeading) {
            PasteAwareTextView(text: $text, height: $textHeight, onPasteImages: addImages)
                .frame(height: textHeight)
            if text.isEmpty {
                Text("Message Claude…")
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .allowsHitTesting(false)
            }
        }
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 18))
    }

    private var sendButton: some View {
        Button {
            send()
        } label: {
            if sending {
                ProgressView()
                    .frame(width: 30, height: 30)
            } else {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 30))
            }
        }
        .frame(height: 34)
        .disabled(!canSend || sending)
    }

    private func addImages(_ images: [UIImage]) {
        for (offset, image) in images.enumerated() {
            if let attachment = Attachment.image(image, index: attachments.count + offset) {
                attachments.append(attachment)
            }
        }
    }

    private func loadPickedItems(_ items: [PhotosPickerItem]) async {
        for item in items {
            guard let type = item.supportedContentTypes.first,
                  let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let isVideo = type.conforms(to: .movie) || type.conforms(to: .audiovisualContent)
            let ext = type.preferredFilenameExtension ?? (isVideo ? "mov" : "jpg")
            let mime = type.preferredMIMEType ?? (isVideo ? "video/quicktime" : "image/jpeg")
            let thumbnail = isVideo ? nil : UIImage(data: data)
            let attachment = Attachment(
                filename: "media-\(attachments.count).\(ext)",
                contentType: mime,
                data: data,
                isVideo: isVideo,
                thumbnail: thumbnail
            )
            await MainActor.run { attachments.append(attachment) }
        }
        await MainActor.run { pickerItems = [] }
    }

    private func send() {
        guard !sending, canSend, let api else { return }
        errorText = nil
        sending = true
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let outgoing = attachments
        Task {
            do {
                var paths: [String] = []
                for attachment in outgoing {
                    paths.append(try await api.upload(
                        sessionName,
                        data: attachment.data,
                        filename: attachment.filename,
                        contentType: attachment.contentType
                    ))
                }
                let body = ([trimmed] + paths).filter { !$0.isEmpty }.joined(separator: " ")
                try await api.sendText(sessionName, text: body)
                await MainActor.run {
                    text = ""
                    attachments = []
                    sending = false
                }
            } catch {
                await MainActor.run {
                    sending = false
                    errorText = "Send failed: \(error.localizedDescription)"
                }
            }
        }
    }
}
