import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Workspace } from "./workspaces.js";

// workspaces.ts loads the server config at module evaluation time. Keep that
// test-only config isolated from the user's real Mission Control installation.
process.env.HOME = mkdtempSync(join(tmpdir(), "mission-control-pr-test-"));

const { parseAuthoredPullRequests, parseUnreadReviewComments } = await import("./pull-requests.js");

const workspace: Workspace = {
  id: "workspace-1",
  name: "Control",
  path: "/code/control",
  origin: "github.com/acme/control",
  worktrees: [
    { path: "/code/control", branch: "main", isMain: true, dirty: false },
    { path: "/code/control-pr", branch: "feature/flight-deck", isMain: false, dirty: false },
  ],
};

test("pull request parsing resolves its branch worktree and attention state", () => {
  const raw = JSON.stringify([{
    url: "https://github.com/acme/control/pull/42",
    number: 42,
    title: "Add the flight deck",
    headRefName: "feature/flight-deck",
    baseRefName: "main",
    isDraft: false,
    reviewDecision: "CHANGES_REQUESTED",
    updatedAt: "2026-08-02T10:00:00Z",
    additions: 120,
    deletions: 14,
    changedFiles: 8,
    comments: [{ author: { login: "reviewer" }, body: "Please cover this case.", createdAt: "2026-08-02T09:00:00Z" }],
    latestReviews: [{ author: { login: "reviewer" }, body: "One more thought.", submittedAt: "2026-08-02T09:30:00Z" }],
    statusCheckRollup: [
      { name: "build", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "lint", status: "COMPLETED", conclusion: "FAILURE" },
      { context: "deploy", state: "PENDING" },
    ],
  }]);

  const result = parseAuthoredPullRequests(raw, workspace, new Set(["acme/control#42"]));
  assert.equal(result.length, 1);
  assert.equal(result[0].repository, "acme/control");
  assert.equal(result[0].worktreePath, "/code/control-pr");
  assert.equal(result[0].hasUnreadActivity, true);
  assert.equal(result[0].latestCommentAt, "2026-08-02T09:30:00Z");
  assert.deepEqual(result[0].checks.map((check) => check.state), ["pass", "fail", "pending"]);
});

test("pull request parsing remains useful without a matching worktree", () => {
  const raw = JSON.stringify([{
    url: "https://github.com/acme/control/pull/7",
    number: 7,
    title: "Draft experiment",
    headRefName: "remote-only",
    baseRefName: "main",
    isDraft: true,
    updatedAt: "2026-08-01T10:00:00Z",
  }]);
  const [result] = parseAuthoredPullRequests(raw, workspace);
  assert.equal(result.worktreePath, null);
  assert.equal(result.isDraft, true);
  assert.deepEqual(result.comments, []);
  assert.deepEqual(result.checks, []);
});

test("unread review comments exclude bots, old activity, and raw markup", () => {
  const raw = JSON.stringify([[
    {
      user: { login: "reviewer", type: "User" },
      body: "<!-- hidden --> **Could we keep this value stable?**",
      created_at: "2026-08-02T10:05:00Z",
      path: "Sources/Inbox.swift",
      line: 42,
    },
    {
      user: { login: "checks[bot]", type: "Bot" },
      body: "Automated report",
      created_at: "2026-08-02T10:06:00Z",
    },
    {
      user: { login: "reviewer", type: "User" },
      body: "Already read",
      created_at: "2026-08-02T09:00:00Z",
    },
  ]]);

  const result = parseUnreadReviewComments(raw, "2026-08-02T10:00:00Z", "2026-08-02T10:06:00Z");
  assert.deepEqual(result, [{
    author: "reviewer",
    body: "Could we keep this value stable?",
    createdAt: "2026-08-02T10:05:00Z",
    path: "Sources/Inbox.swift",
    line: 42,
  }]);
});
