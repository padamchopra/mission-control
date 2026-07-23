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
    @State private var cursorRange = NSRange(location: 0, length: 0)
    @State private var suggestionMode: ComposerSuggestionMode?
    @State private var fileSuggestions: [FileSuggestion] = []
    @State private var skillSuggestions: [SkillSuggestion] = []
    @State private var loadingSuggestions = false
    @State private var suggestionError: String?
    @State private var suggestionRequest = UUID()

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
            suggestionPicker
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
        .onChange(of: text) { _, newText in
            updateSuggestions(for: newText, selection: cursorRange)
        }
        .onChange(of: cursorRange) { _, newRange in
            updateSuggestions(for: text, selection: newRange)
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
            PasteAwareTextView(
                text: $text,
                selection: $cursorRange,
                height: $textHeight,
                onPasteImages: addImages,
                onCommandEnter: send
            )
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

    @ViewBuilder
    private var suggestionPicker: some View {
        if let suggestionMode {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Image(systemName: suggestionMode.icon)
                    Text(suggestionMode.title)
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Text(suggestionMode.hint)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 12)
                .padding(.top, 9)
                .padding(.bottom, 4)

                if loadingSuggestions {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Searching…")
                            .foregroundStyle(.secondary)
                    }
                    .font(.caption)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                } else if let suggestionError {
                    emptySuggestionState(suggestionError)
                } else if suggestionMode.isFile, fileSuggestions.isEmpty {
                    emptySuggestionState("No matching project files")
                } else if !suggestionMode.isFile, skillSuggestions.isEmpty {
                    emptySuggestionState("No matching skills")
                } else if suggestionMode.isFile {
                    ForEach(fileSuggestions.prefix(6)) { file in
                        Button { insertFileTag(file.path) } label: {
                            Label(file.path, systemImage: "doc")
                                .font(.subheadline.monospaced())
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                    }
                } else {
                    ForEach(skillSuggestions.prefix(6)) { skill in
                        Button { insertSkill(skill.name) } label: {
                            HStack(spacing: 9) {
                                Image(systemName: "wand.and.stars")
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("/\(skill.name)")
                                        .font(.subheadline.monospaced().weight(.medium))
                                    if let description = skill.description, !description.isEmpty {
                                        Text(description)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer()
                                Text(skill.source)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                    }
                }
            }
            .foregroundStyle(.primary)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(.white.opacity(0.1), lineWidth: 1)
            }
        }
    }

    private func emptySuggestionState(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
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
        .keyboardShortcut(.return, modifiers: .command)
        .help("Send message (Command-Return)")
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
                    cursorRange = NSRange(location: 0, length: 0)
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

    private func updateSuggestions(for text: String, selection: NSRange) {
        guard let mode = ComposerSuggestionMode(text: text, selection: selection), let api else {
            suggestionMode = nil
            loadingSuggestions = false
            suggestionError = nil
            return
        }
        suggestionMode = mode
        loadingSuggestions = true
        suggestionError = nil
        let request = UUID()
        suggestionRequest = request

        Task {
            // Avoid one network request per keystroke while the user is still
            // narrowing a file or skill name.
            try? await Task.sleep(for: .milliseconds(130))
            guard suggestionRequest == request else { return }
            do {
                if mode.isFile {
                    let files = try await api.files(sessionName, matching: mode.query)
                    guard suggestionRequest == request else { return }
                    fileSuggestions = files
                } else {
                    let skills = try await api.skills(sessionName, matching: mode.query)
                    guard suggestionRequest == request else { return }
                    skillSuggestions = skills
                }
            } catch {
                guard suggestionRequest == request else { return }
                if mode.isFile { fileSuggestions = [] } else { skillSuggestions = [] }
                suggestionError = mode.isFile ? "Couldn’t search project files" : "Couldn’t search skills"
            }
            guard suggestionRequest == request else { return }
            loadingSuggestions = false
        }
    }

    private func insertFileTag(_ path: String) {
        replaceActiveToken(with: "@\(path)")
    }

    private func insertSkill(_ name: String) {
        replaceActiveToken(with: "/\(name)")
    }

    private func replaceActiveToken(with replacement: String) {
        guard let range = ComposerSuggestionMode.activeTokenRange(text: text, selection: cursorRange) else { return }
        let inserted = "\(replacement) "
        text = (text as NSString).replacingCharacters(in: range, with: inserted)
        cursorRange = NSRange(location: range.location + (inserted as NSString).length, length: 0)
        suggestionMode = nil
        loadingSuggestions = false
        suggestionError = nil
    }
}

private enum ComposerSuggestionMode: Equatable {
    case file(query: String)
    case skill(query: String)

    init?(text: String, selection: NSRange) {
        guard let range = Self.activeTokenRange(text: text, selection: selection) else { return nil }
        let token = (text as NSString).substring(with: range)
        guard let trigger = token.first else { return nil }
        let query = String(token.dropFirst())
        switch trigger {
        case "@" where !query.contains("@"):
            self = .file(query: query)
        case "/" where !query.contains("/"):
            self = .skill(query: query)
        default:
            return nil
        }
    }

    static func activeTokenRange(text: String, selection: NSRange) -> NSRange? {
        let nsText = text as NSString
        guard selection.length == 0, selection.location <= nsText.length else { return nil }
        var start = selection.location
        while start > 0 {
            let scalar = nsText.character(at: start - 1)
            guard let unicode = UnicodeScalar(scalar),
                  !CharacterSet.whitespacesAndNewlines.contains(unicode) else { break }
            start -= 1
        }
        return NSRange(location: start, length: selection.location - start)
    }

    var query: String {
        switch self {
        case let .file(query), let .skill(query): query
        }
    }

    var isFile: Bool {
        if case .file = self { return true }
        return false
    }

    var title: String { isFile ? "Tag a file" : "Run a skill" }
    var hint: String { isFile ? "@ to search" : "/ to search" }
    var icon: String { isFile ? "at" : "wand.and.stars" }
}
