import SwiftUI

/// A lightweight, keyboard-first switcher for the desktop app. It intentionally
/// focuses on the job that happens most often: getting from an alert to the
/// right session without hunting through the sidebar.
struct SessionCommandPalette: View {
    let sessions: [TmuxSession]
    var onOpen: (String) -> Void
    var onManageServers: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var matches: [TmuxSession] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return sessions.sorted(by: paletteOrder) }
        return sessions.filter {
            $0.name.localizedCaseInsensitiveContains(term)
                || $0.panePath.localizedCaseInsensitiveContains(term)
                || $0.paneCommand.localizedCaseInsensitiveContains(term)
        }.sorted(by: paletteOrder)
    }

    var body: some View {
        NavigationStack {
            List(matches) { session in
                Button {
                    onOpen(session.name)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: symbol(for: session.resolvedState))
                            .foregroundStyle(color(for: session.resolvedState))
                            .frame(width: 18)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.name).foregroundStyle(.primary)
                            Text(session.preview ?? session.panePath)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        Text(session.resolvedState.rawValue.replacingOccurrences(of: "_", with: " "))
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                HStack(spacing: 16) {
                    Button {
                        guard let session = matches.first else { return }
                        onOpen(session.name)
                    } label: {
                        Label("Open next", systemImage: "arrow.right.circle")
                    }
                    .disabled(matches.isEmpty)

                    Button {
                        onManageServers()
                    } label: {
                        Label("Manage servers", systemImage: "server.rack")
                    }
                }
                .font(.caption.weight(.medium))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(.bar)
            }
            .overlay {
                if matches.isEmpty {
                    ContentUnavailableView.search(text: query)
                }
            }
            .navigationTitle("Quick Open")
            .searchable(text: $query, prompt: "Search sessions, folders, commands")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func paletteOrder(_ left: TmuxSession, _ right: TmuxSession) -> Bool {
        rank(left.resolvedState) != rank(right.resolvedState)
            ? rank(left.resolvedState) < rank(right.resolvedState)
            : left.lastOutputAt > right.lastOutputAt
    }

    private func rank(_ state: SessionState) -> Int {
        switch state {
        case .needsInput: return 0
        case .working: return 1
        case .idle: return 2
        case .unknown: return 3
        }
    }

    private func symbol(for state: SessionState) -> String {
        switch state {
        case .needsInput: return "exclamationmark.bubble"
        case .working: return "circle.dotted"
        case .idle: return "checkmark.circle"
        case .unknown: return "questionmark.circle"
        }
    }

    private func color(for state: SessionState) -> Color {
        switch state {
        case .needsInput: return .orange
        case .working: return .blue
        case .idle: return .green
        case .unknown: return .secondary
        }
    }
}
