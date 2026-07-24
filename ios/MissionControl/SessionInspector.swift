import SwiftUI

/// The Mac's right-hand inspector: what changed, the plan, and CI — beside the
/// conversation, using the desktop's extra width. Fetches its own data so it
/// works in either Conversation or Terminal mode. Desktop-only by intent.
struct SessionInspector: View {
    let sessionName: String
    let serverURL: String
    let token: String

    private enum Tab: String, CaseIterable { case changes = "Changes", plan = "Plan", checks = "Checks" }
    @State private var tab: Tab = .changes
    @State private var conversation: Conversation?
    @State private var checks: SessionChecks?

    private var api: APIClient? { APIClient(urlString: serverURL, token: token) }

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(12)
            Divider().overlay(Color(white: 0.16))
            ScrollView {
                VStack(alignment: .leading, spacing: 11) {
                    switch tab {
                    case .changes: changesTab
                    case .plan: planTab
                    case .checks: checksTab
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(white: 0.07))
        .task { await pollLoop() }
    }

    // MARK: Changes

    private struct FileChange: Identifiable {
        let path: String
        var adds: Int
        var dels: Int
        var id: String { path }
    }

    private var fileChanges: [FileChange] {
        guard let entries = conversation?.entries else { return [] }
        var byFile: [String: FileChange] = [:]
        for entry in entries where entry.kind == "tool" {
            guard let file = entry.file, (entry.adds ?? 0) > 0 || (entry.dels ?? 0) > 0 else { continue }
            var change = byFile[file] ?? FileChange(path: file, adds: 0, dels: 0)
            change.adds += entry.adds ?? 0
            change.dels += entry.dels ?? 0
            byFile[file] = change
        }
        return byFile.values.sorted { ($0.adds + $0.dels) > ($1.adds + $1.dels) }
    }

    @ViewBuilder
    private var changesTab: some View {
        let changes = fileChanges
        if changes.isEmpty {
            placeholder("square.and.pencil", "No file edits in this session yet")
        } else {
            let adds = changes.reduce(0) { $0 + $1.adds }
            let dels = changes.reduce(0) { $0 + $1.dels }
            HStack(spacing: 6) {
                Text("\(changes.count) file\(changes.count == 1 ? "" : "s")").foregroundStyle(Color(white: 0.5))
                Text("+\(adds)").foregroundStyle(.green)
                Text("−\(dels)").foregroundStyle(.red)
            }
            .font(.caption)
            ForEach(changes) { change in
                HStack(spacing: 8) {
                    Text(basename(change.path))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(Color(white: 0.85))
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer(minLength: 6)
                    if change.adds > 0 {
                        Text("+\(change.adds)").font(.system(.caption2, design: .monospaced)).foregroundStyle(.green)
                    }
                    if change.dels > 0 {
                        Text("−\(change.dels)").font(.system(.caption2, design: .monospaced)).foregroundStyle(.red)
                    }
                }
            }
        }
    }

    // MARK: Plan

    @ViewBuilder
    private var planTab: some View {
        let todos = conversation?.todos ?? []
        if todos.isEmpty {
            placeholder("checklist", "No plan for this session")
        } else {
            let done = todos.filter { $0.status == "completed" }.count
            Text("\(done) of \(todos.count) done")
                .font(.caption).foregroundStyle(Color(white: 0.5))
            ForEach(Array(todos.enumerated()), id: \.offset) { _, todo in
                HStack(alignment: .top, spacing: 9) {
                    todoBox(todo.status).padding(.top, 1)
                    Text(todo.content)
                        .font(.caption)
                        .foregroundStyle(todo.status == "completed" ? Color(white: 0.5) : Color(white: 0.9))
                        .strikethrough(todo.status == "completed", color: Color(white: 0.4))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    @ViewBuilder
    private func todoBox(_ status: String) -> some View {
        switch status {
        case "completed":
            Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.black)
                .frame(width: 15, height: 15).background(Color.green, in: RoundedRectangle(cornerRadius: 4))
        case "in_progress":
            RoundedRectangle(cornerRadius: 4).stroke(Color.orange, lineWidth: 2).frame(width: 15, height: 15)
                .overlay(RoundedRectangle(cornerRadius: 2).fill(Color.orange).frame(width: 7, height: 7))
        default:
            RoundedRectangle(cornerRadius: 4).stroke(Color(white: 0.3), lineWidth: 1.5).frame(width: 15, height: 15)
        }
    }

    // MARK: Checks

    @ViewBuilder
    private var checksTab: some View {
        if let checks {
            if !checks.available {
                placeholder("arrow.triangle.pull", "No open pull request for this branch")
            } else if checks.checks.isEmpty {
                placeholder("checkmark.seal", "No checks reported yet")
            } else {
                ForEach(checks.checks) { run in
                    HStack(spacing: 9) {
                        checkIcon(run.state)
                        Text(run.name)
                            .font(.caption)
                            .foregroundStyle(Color(white: 0.88))
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer(minLength: 6)
                        Text(run.state)
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(checkColor(run.state))
                    }
                }
            }
        } else {
            ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.top, 12)
        }
    }

    @ViewBuilder
    private func checkIcon(_ state: String) -> some View {
        switch state {
        case "pass", "success":
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case "fail", "failure", "error":
            Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
        case "pending", "in_progress", "queued":
            Image(systemName: "clock.fill").foregroundStyle(.orange)
        default:
            Image(systemName: "minus.circle.fill").foregroundStyle(Color(white: 0.4))
        }
    }

    private func checkColor(_ state: String) -> Color {
        switch state {
        case "pass", "success": return .green
        case "fail", "failure", "error": return .red
        case "pending", "in_progress", "queued": return .orange
        default: return Color(white: 0.5)
        }
    }

    // MARK: Shared

    private func placeholder(_ symbol: String, _ text: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: symbol).font(.system(size: 26)).foregroundStyle(Color(white: 0.35))
            Text(text)
                .font(.caption)
                .foregroundStyle(Color(white: 0.5))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 30)
    }

    private func basename(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    private func pollLoop() async {
        await refresh()
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(4))
            if Task.isCancelled { break }
            await refresh()
        }
    }

    private func refresh() async {
        guard let api else { return }
        if let fresh = try? await api.conversation(sessionName) { conversation = fresh }
        if let fresh = try? await api.checks(sessionName) { checks = fresh }
    }
}
