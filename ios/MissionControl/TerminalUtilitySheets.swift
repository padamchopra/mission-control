import SwiftUI

struct TerminalSearchSheet: View {
    let sessionName: String
    let serverURL: String
    let token: String

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var snapshot = ""
    @State private var isLoading = true

    private var matches: [(offset: Int, element: String)] {
        let lines = snapshot.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return [] }
        return Array(lines.enumerated().filter { $0.element.localizedCaseInsensitiveContains(term) }.suffix(100))
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading terminal history…")
                } else if query.isEmpty {
                    ContentUnavailableView("Find in terminal", systemImage: "magnifyingglass", description: Text("Search the latest terminal history."))
                } else if matches.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else {
                    List(matches, id: \.offset) { match in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(match.offset + 1)")
                                .font(.caption.monospaced())
                                .foregroundStyle(.tertiary)
                            Text(match.element)
                                .font(.caption.monospaced())
                                .textSelection(.enabled)
                        }
                    }
                }
            }
            .navigationTitle("Find in Terminal")
            .searchable(text: $query, prompt: "Search latest output")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        defer { isLoading = false }
        guard let api = APIClient(urlString: serverURL, token: token) else { return }
        snapshot = (try? await api.snapshot(sessionName)) ?? ""
    }
}

struct SessionActivitySheet: View {
    let sessionName: String
    let serverURL: String
    let token: String

    @Environment(\.dismiss) private var dismiss
    @State private var activity: [SessionActivity] = []
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading activity…")
                } else if activity.isEmpty {
                    ContentUnavailableView("No activity yet", systemImage: "clock", description: Text("Future session events will appear here."))
                } else {
                    List(activity) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(item.event).font(.headline)
                                Spacer()
                                Text(item.date.formatted(.relative(presentation: .named)))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Text(item.message)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
            .navigationTitle("Session Activity")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        defer { isLoading = false }
        guard let api = APIClient(urlString: serverURL, token: token) else { return }
        activity = (try? await api.activity(sessionName)) ?? []
    }
}
