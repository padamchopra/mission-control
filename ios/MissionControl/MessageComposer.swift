import PhotosUI
import SwiftUI

/// Where a composed message goes. A tmux session takes it through `send-keys`;
/// a chat hands it to the Claude process the server is holding. Everything else
/// about composing — attachments, `@file`, `/skill`, quick replies, history — is
/// the same, so both surfaces use this one composer.
enum ComposerTarget: Equatable {
    case session(String)
    case chat(String)

    var isChat: Bool {
        if case .chat = self { return true }
        return false
    }
}

struct MessageComposer: View {
    let target: ComposerTarget
    /// Claude Code queues anything typed while it's mid-turn. Codex treats input
    /// as live steering, so the queue treatment is provider-specific.
    var sessionState: SessionState?
    var agent: AgentKind?

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
    // Recent sent messages, unit-separated so multi-line messages survive.
    @AppStorage("composerHistory") private var historyRaw = ""

    @ObservedObject private var quickReplies = QuickRepliesStore.shared

    private var recents: [String] {
        historyRaw.split(separator: "\u{1F}").map(String.init)
    }

    private var api: APIClient? {
        APIClient(urlString: serverURL, token: serverToken)
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty
    }

    /// Claude Code holds anything sent mid-turn and picks it up when the turn
    /// ends, so sending now is queueing — worth saying out loud.
    private var willQueue: Bool { (agent == .claude || target.isChat) && sessionState == .working }
    private var agentName: String { target.isChat ? "Claude" : (agent ?? .shell).displayName }

    var body: some View {
        VStack(spacing: 8) {
            if let errorText {
                Text(errorText)
                    .font(.caption)
                    .foregroundStyle(MCColor.errorForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Only once there's something to send. The placeholder already says
            // "Queue a message", so an unconditional banner would just be a line
            // of orange sitting there for the minutes an agent spends working.
            if willQueue, canSend {
                queueHint
            }
            if !attachments.isEmpty {
                attachmentChips
            }
            suggestionPicker
            HStack(alignment: .center, spacing: 10) {
                attachMenu
                inputField
                sendButton
            }
        }
        #if targetEnvironment(macCatalyst)
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(FlightDeckPalette.chrome)
        .overlay(alignment: .top) { Rectangle().fill(FlightDeckPalette.border).frame(height: 1) }
        #else
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(MobileFlightDeckPalette.surface)
        .overlay(alignment: .top) { Rectangle().fill(MobileFlightDeckPalette.border).frame(height: 1) }
        #endif
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
        #if !targetEnvironment(macCatalyst)
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in addImages([image]) }
                .ignoresSafeArea()
        }
        #endif
    }

    // The queue itself is rendered in the conversation feed, from the server's
    // record of it, so it shows on every device rather than only the one that
    // typed it. All the composer owes you is a heads-up before you send.
    private var queueHint: some View {
        Label("Claude is working — this will be queued until the turn ends.", systemImage: "clock")
            .font(.caption2)
            .foregroundStyle(MCColor.warningForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
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
            .clipShape(RoundedRectangle(cornerRadius: MCRadius.lg, style: .continuous))

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
            #if !targetEnvironment(macCatalyst)
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button {
                    showCamera = true
                } label: {
                    Label("Take Photo", systemImage: "camera")
                }
            }
            #endif
        } label: {
            #if targetEnvironment(macCatalyst)
            Text("+")
                .font(.flightSans(16))
                .foregroundStyle(FlightDeckPalette.secondary)
                .frame(width: 36, height: 36)
                .overlay(Rectangle().stroke(FlightDeckPalette.strongBorder))
            #else
            Image(systemName: "plus")
                .font(.mobileDeckSans(17))
                .foregroundStyle(MobileFlightDeckPalette.secondary)
                .frame(width: 36, height: 36)
                .overlay(Circle().stroke(MobileFlightDeckPalette.border))
            #endif
        }
        #if targetEnvironment(macCatalyst)
        .frame(width: 36, height: 40)
        #else
        .frame(height: 34)
        #endif
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
                Text(willQueue ? "Queue a message for Claude…" : "Message \(agentName)…")
                    .foregroundStyle(MCColor.mutedForeground)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .allowsHitTesting(false)
            }
        }
        #if targetEnvironment(macCatalyst)
        .frame(minHeight: 40)
        .background(FlightDeckPalette.chrome)
        .overlay(Rectangle().stroke(FlightDeckPalette.strongBorder))
        #else
        .frame(minHeight: 40)
        .background(MobileFlightDeckPalette.background, in: RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: MCRadius.xxl, style: .continuous).stroke(MobileFlightDeckPalette.border))
        #endif
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
                        .foregroundStyle(MCColor.mutedForeground)
                }
                .padding(.horizontal, 12)
                .padding(.top, 9)
                .padding(.bottom, 4)

                if loadingSuggestions {
                    HStack(spacing: 8) {
                        ProgressView().controlSize(.small)
                        Text("Searching…")
                            .foregroundStyle(MCColor.mutedForeground)
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
                                            .foregroundStyle(MCColor.mutedForeground)
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
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: MCRadius.xl, style: .continuous)
                    .stroke(.white.opacity(0.1), lineWidth: 1)
            }
        }
    }

    private func emptySuggestionState(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(MCColor.mutedForeground)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
    }

    private var sendButton: some View {
        Button {
            send()
        } label: {
            if sending {
                ProgressView()
                    #if targetEnvironment(macCatalyst)
                    .tint(FlightDeckPalette.onAccent)
                    .frame(width: 52, height: 40)
                    .background(FlightDeckPalette.amber)
                    #else
                    .frame(width: 30, height: 30)
                    #endif
            } else {
                #if targetEnvironment(macCatalyst)
                Text("Send")
                    .font(.flightMono(8, weight: .bold))
                    .foregroundStyle(FlightDeckPalette.onAccent)
                    .frame(width: 52, height: 40)
                    .background(FlightDeckPalette.amber)
                #else
                Image(systemName: "arrow.up")
                    .font(.mobileDeckSans(17, weight: .bold))
                    .foregroundStyle(MobileFlightDeckPalette.onAccent)
                    .frame(width: 40, height: 40)
                    .background(MobileFlightDeckPalette.amber, in: Circle())
                #endif
            }
        }
        #if targetEnvironment(macCatalyst)
        .frame(width: 52, height: 40)
        #else
        .frame(width: 40, height: 40)
        #endif
        .disabled(!canSend || sending)
        .keyboardShortcut(.return, modifiers: .command)
        .help(willQueue ? "Queue message (Command-Return)" : "Send message (Command-Return)")
        .accessibilityLabel(willQueue ? "Queue message" : "Send message")
    }

    private var quickMenu: some View {
        Menu {
            if !quickReplies.replies.isEmpty {
                Section("Quick replies") {
                    ForEach(quickReplies.replies, id: \.self) { phrase in
                        Button(phrase) { fill(phrase) }
                    }
                }
            }
            if !recents.isEmpty {
                Section("Recent") {
                    ForEach(recents.prefix(6), id: \.self) { phrase in
                        Button(phrase.replacingOccurrences(of: "\n", with: " ")) { fill(phrase) }
                    }
                }
            }
        } label: {
            Image(systemName: "bolt.circle")
                .font(.system(size: 30))
                #if targetEnvironment(macCatalyst)
                .foregroundStyle(FlightDeckPalette.secondary)
                #else
                .foregroundStyle(MCColor.mutedForeground)
                #endif
        }
        .frame(height: 34)
        .menuOrder(.fixed)
    }

    private func fill(_ phrase: String) {
        text = phrase
        cursorRange = NSRange(location: (phrase as NSString).length, length: 0)
    }

    private func recordHistory(_ message: String) {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var list = recents.filter { $0 != trimmed }
        list.insert(trimmed, at: 0)
        historyRaw = list.prefix(8).joined(separator: "\u{1F}")
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
                    paths.append(try await upload(attachment, using: api))
                }
                let body = ([trimmed] + paths).filter { !$0.isEmpty }.joined(separator: " ")
                try await deliver(body, using: api)
                await MainActor.run {
                    recordHistory(trimmed)
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

    private func upload(_ attachment: Attachment, using api: APIClient) async throws -> String {
        switch target {
        case .session(let name):
            return try await api.upload(
                name,
                data: attachment.data,
                filename: attachment.filename,
                contentType: attachment.contentType
            )
        case .chat(let id):
            return try await api.uploadToChat(
                id,
                data: attachment.data,
                filename: attachment.filename,
                contentType: attachment.contentType
            )
        }
    }

    private func deliver(_ body: String, using api: APIClient) async throws {
        switch target {
        case .session(let name):
            try await api.sendText(name, text: body)
        case .chat(let id):
            try await ChatStore.shared.send(id, text: body)
        }
    }

    private func findFiles(matching query: String, using api: APIClient) async throws -> [FileSuggestion] {
        switch target {
        case .session(let name): return try await api.files(name, matching: query)
        case .chat(let id): return try await api.chatFiles(id, matching: query)
        }
    }

    private func findSkills(matching query: String, using api: APIClient) async throws -> [SkillSuggestion] {
        switch target {
        case .session(let name): return try await api.skills(name, matching: query)
        case .chat(let id): return try await api.chatSkills(id, matching: query)
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
                    let files = try await findFiles(matching: mode.query, using: api)
                    guard suggestionRequest == request else { return }
                    fileSuggestions = files
                } else {
                    let skills = try await findSkills(matching: mode.query, using: api)
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
