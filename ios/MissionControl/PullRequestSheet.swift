import SwiftUI

/// Ship from your phone: open a PR, watch CI, read review comments, and merge
/// (now or when green) — all from one session's branch.
struct PullRequestSheet: View {
    let sessionName: String
    let api: APIClient?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var toasts: ToastCenter

    @State private var links: SessionLinks?
    @State private var checks: SessionChecks?
    @State private var comments: [ReviewComment] = []
    @State private var busy = false
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            List {
                if let url = links?.prUrl, !url.isEmpty {
                    prSection(url: url)
                    checksSection
                    if !comments.isEmpty { commentsSection }
                } else if loaded {
                    noPRSection
                } else {
                    Section { HStack { Spacer(); ProgressView(); Spacer() } }
                }
            }
            .navigationTitle("Pull request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { await refresh() }
        }
    }

    private func prSection(url: String) -> some View {
        Section {
            Button {
                if let target = URL(string: url) { openURL(target) }
            } label: {
                Label("Open on GitHub", systemImage: "arrow.up.forward.square")
            }
            Button { merge(auto: true) } label: {
                Label("Merge when green", systemImage: "checkmark.seal")
            }
            .disabled(busy)
            Button { merge(auto: false) } label: {
                Label("Merge now (squash)", systemImage: "arrow.triangle.merge")
            }
            .disabled(busy)
        } header: {
            Text(url.replacingOccurrences(of: "https://", with: ""))
        }
    }

    private var checksSection: some View {
        Section("Checks") {
            if let checks, checks.available {
                if checks.checks.isEmpty {
                    Text("No checks reported yet").foregroundStyle(.secondary)
                }
                ForEach(checks.checks) { run in
                    HStack(spacing: 10) {
                        checkIcon(run.state)
                        Text(run.name)
                        Spacer()
                        Text(run.state).font(.caption.monospaced()).foregroundStyle(.secondary)
                    }
                }
            } else {
                Text("No checks").foregroundStyle(.secondary)
            }
        }
    }

    private var commentsSection: some View {
        Section("Review") {
            ForEach(comments) { comment in
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(comment.author).font(.caption.weight(.semibold))
                        if let state = comment.state, !state.isEmpty {
                            Text(state.lowercased()).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    if !comment.body.isEmpty {
                        Text(comment.body).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var noPRSection: some View {
        Section {
            if busy {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else {
                Button { createPR() } label: {
                    Label("Open pull request", systemImage: "arrow.triangle.pull")
                }
            }
        } footer: {
            Text("Creates a PR for this branch, with a title and body filled in from your commits.")
        }
    }

    @ViewBuilder
    private func checkIcon(_ state: String) -> some View {
        switch state {
        case "pass", "success": Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case "fail", "failure", "error": Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
        case "pending", "in_progress", "queued": Image(systemName: "clock.fill").foregroundStyle(.orange)
        default: Image(systemName: "minus.circle.fill").foregroundStyle(.secondary)
        }
    }

    private func refresh() async {
        guard let api else { loaded = true; return }
        links = try? await api.links(sessionName, refresh: true, includePullRequest: true)
        checks = try? await api.checks(sessionName)
        comments = (try? await api.reviews(sessionName)) ?? []
        loaded = true
    }

    private func createPR() {
        guard let api else { return }
        busy = true
        Task {
            do {
                _ = try await api.createPullRequest(sessionName, title: nil, body: nil)
                toasts.show(.success, "Pull request opened")
                await refresh()
            } catch {
                toasts.show(.error, "Couldn't open a PR — make sure the branch is pushed.")
            }
            busy = false
        }
    }

    private func merge(auto: Bool) {
        guard let api else { return }
        busy = true
        Task {
            do {
                try await api.mergePullRequest(sessionName, auto: auto)
                toasts.show(.success, auto ? "Will merge when checks pass" : "Merged")
            } catch {
                toasts.show(.error, "Merge failed")
            }
            busy = false
        }
    }
}
