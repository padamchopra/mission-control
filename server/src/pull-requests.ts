import { run as exec } from "./run.js";
import { listWorkspaces, type Workspace } from "./workspaces.js";

export interface PullRequestCheck {
  name: string;
  state: "pass" | "fail" | "pending" | "skipping";
}

export interface PullRequestComment {
  author: string;
  body: string;
  createdAt: string | null;
  path?: string | null;
  line?: number | null;
}

export interface AuthoredPullRequest {
  url: string;
  number: number;
  title: string;
  repository: string;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  reviewDecision: string;
  authorLogin: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  checks: PullRequestCheck[];
  comments: PullRequestComment[];
  unreadComments: PullRequestComment[];
  unreadSince: string | null;
  latestCommentAt: string | null;
  hasUnreadActivity: boolean;
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
  worktreePath: string | null;
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; pullRequests: AuthoredPullRequest[] } | null = null;

export async function listAuthoredPullRequests(refresh = false): Promise<AuthoredPullRequest[]> {
  if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.pullRequests;
  const workspaces = await listWorkspaces();
  const unread = await unreadPullRequestAttention();
  const batches = await Promise.all(workspaces.map((workspace) => pullRequestsForWorkspace(workspace, unread)));
  const byURL = new Map<string, AuthoredPullRequest>();
  for (const pullRequest of batches.flat()) {
    const existing = byURL.get(pullRequest.url);
    // Prefer the workspace copy that can resolve the PR branch to a worktree.
    if (!existing || (!existing.worktreePath && pullRequest.worktreePath)) byURL.set(pullRequest.url, pullRequest);
  }
  const pullRequests = [...byURL.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  cache = { at: Date.now(), pullRequests };
  return pullRequests;
}

async function pullRequestsForWorkspace(
  workspace: Workspace,
  unread: Map<string, PullRequestAttention>,
): Promise<AuthoredPullRequest[]> {
  try {
    const fields = [
      "url", "number", "title", "headRefName", "baseRefName", "isDraft", "reviewDecision", "author",
      "updatedAt", "additions", "deletions", "changedFiles", "comments", "latestReviews", "statusCheckRollup",
    ].join(",");
    const { stdout } = await exec(
      "gh",
      ["pr", "list", "--author", "@me", "--state", "open", "--limit", "100", "--json", fields],
      { cwd: workspace.path, timeout: 30_000 },
    );
    const pullRequests = parseAuthoredPullRequests(stdout, workspace, new Set(unread.keys()));
    return Promise.all(pullRequests.map(async (pullRequest) => {
      const attention = unread.get(pullRequestKey(pullRequest.repository, pullRequest.number));
      if (!attention) return pullRequest;
      const unreadComments = await fetchUnreadReviewComments(workspace, pullRequest, attention);
      const latestUnreadAt = unreadComments
        .map((comment) => comment.createdAt)
        .filter((date): date is string => Boolean(date))
        .sort()
        .pop() ?? null;
      return {
        ...pullRequest,
        unreadComments,
        unreadSince: attention.lastReadAt,
        latestCommentAt: [pullRequest.latestCommentAt, latestUnreadAt]
          .filter((date): date is string => Boolean(date))
          .sort()
          .pop() ?? null,
      };
    }));
  } catch (error) {
    const detail = String((error as { stderr?: unknown })?.stderr ?? error ?? "").trim();
    if (detail && !/not logged into|not a git repository|no remotes found/i.test(detail)) {
      console.error(`pull request list failed in ${workspace.path}:`, detail);
    }
    return [];
  }
}

export function parseAuthoredPullRequests(
  raw: string,
  workspace: Workspace,
  unread: Set<string> = new Set(),
): AuthoredPullRequest[] {
  const parsed = JSON.parse(raw || "[]");
  if (!Array.isArray(parsed)) return [];
  const repository = repositoryName(workspace);
  return parsed.flatMap((value: unknown) => {
    const pr = asRecord(value);
    const url = stringValue(pr.url);
    if (!url) return [];
    const headRefName = stringValue(pr.headRefName);
    const comments = parseComments(pr.comments, pr.latestReviews);
    const latestCommentAt = comments
      .map((comment) => comment.createdAt)
      .filter((date): date is string => Boolean(date))
      .sort()
      .pop() ?? null;
    return [{
      url,
      number: numberValue(pr.number),
      title: stringValue(pr.title) || "Untitled pull request",
      repository,
      headRefName,
      baseRefName: stringValue(pr.baseRefName),
      isDraft: Boolean(pr.isDraft),
      reviewDecision: stringValue(pr.reviewDecision).toUpperCase(),
      authorLogin: stringValue(asRecord(pr.author).login),
      updatedAt: stringValue(pr.updatedAt) || new Date(0).toISOString(),
      additions: numberValue(pr.additions),
      deletions: numberValue(pr.deletions),
      changedFiles: numberValue(pr.changedFiles),
      checks: parseChecks(pr.statusCheckRollup),
      comments,
      unreadComments: [],
      unreadSince: null,
      latestCommentAt,
      hasUnreadActivity: unread.has(pullRequestKey(repository, numberValue(pr.number))),
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspacePath: workspace.path,
      worktreePath: workspace.worktrees.find((worktree) => worktree.branch === headRefName)?.path ?? null,
    }];
  });
}

function parseChecks(value: unknown): PullRequestCheck[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const check = asRecord(entry);
    const name = stringValue(check.name) || stringValue(check.context) || stringValue(check.workflowName);
    if (!name) return [];
    const conclusion = (stringValue(check.conclusion) || stringValue(check.state)).toUpperCase();
    const status = stringValue(check.status).toUpperCase();
    let state: PullRequestCheck["state"] = "pending";
    if (["SUCCESS", "NEUTRAL"].includes(conclusion)) state = "pass";
    else if (["SKIPPED", "EXPECTED"].includes(conclusion)) state = "skipping";
    else if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(conclusion)) state = "fail";
    else if (status === "COMPLETED" && !conclusion) state = "pass";
    return [{ name, state }];
  });
}

function parseComments(commentsValue: unknown, reviewsValue: unknown): PullRequestComment[] {
  const combined = [
    ...(Array.isArray(commentsValue) ? commentsValue : []),
    ...(Array.isArray(reviewsValue) ? reviewsValue : []),
  ];
  return combined.flatMap((entry: unknown) => {
    const comment = asRecord(entry);
    const body = stringValue(comment.body).trim();
    if (!body) return [];
    const author = asRecord(comment.author);
    return [{
      author: stringValue(author.login) || "GitHub user",
      body: body.length > 500 ? `${body.slice(0, 500)}…` : body,
      createdAt: stringValue(comment.createdAt) || stringValue(comment.submittedAt) || null,
    }];
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

interface PullRequestAttention {
  threadId: string;
  lastReadAt: string | null;
  updatedAt: string | null;
}

async function unreadPullRequestAttention(): Promise<Map<string, PullRequestAttention>> {
  try {
    const { stdout } = await exec("gh", ["api", "notifications", "--paginate", "--slurp"], { timeout: 30_000 });
    const pages = JSON.parse(stdout || "[]");
    if (!Array.isArray(pages)) return new Map();
    const notifications = pages.flatMap((page: unknown) => Array.isArray(page) ? page : [page]);
    const result = new Map<string, PullRequestAttention>();
    for (const value of notifications) {
      const notification = asRecord(value);
      const subject = asRecord(notification.subject);
      if (stringValue(subject.type) !== "PullRequest") continue;
      const apiURL = stringValue(subject.url);
      const match = apiURL.match(/\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)/);
      if (!match) continue;
      result.set(pullRequestKey(match[1], Number(match[2])), {
        threadId: stringValue(notification.id),
        lastReadAt: stringValue(notification.last_read_at) || null,
        updatedAt: stringValue(notification.updated_at) || null,
      });
    }
    return result;
  } catch {
    return new Map();
  }
}

async function fetchUnreadReviewComments(
  workspace: Workspace,
  pullRequest: AuthoredPullRequest,
  attention: PullRequestAttention,
): Promise<PullRequestComment[]> {
  try {
    const { stdout } = await exec(
      "gh",
      ["api", `repos/${pullRequest.repository}/pulls/${pullRequest.number}/comments`, "--paginate", "--slurp"],
      { cwd: workspace.path, timeout: 30_000 },
    );
    return parseUnreadReviewComments(stdout, attention.lastReadAt, attention.updatedAt, pullRequest.authorLogin);
  } catch {
    return [];
  }
}

export function parseUnreadReviewComments(
  raw: string,
  lastReadAt: string | null,
  notificationUpdatedAt: string | null,
  authorLogin = "",
): PullRequestComment[] {
  const parsed = JSON.parse(raw || "[]");
  if (!Array.isArray(parsed)) return [];
  const entries = parsed.flatMap((page: unknown) => Array.isArray(page) ? page : [page]);
  const readAt = Date.parse(lastReadAt ?? "");
  const notificationAt = Date.parse(notificationUpdatedAt ?? "");
  // A notification with no prior read marker is normally the first activity on
  // a PR. Bound that initial window around GitHub's notification timestamp so
  // Mission Control never labels months of historical discussion as unread.
  const cutoff = Number.isFinite(readAt)
    ? readAt
    : Number.isFinite(notificationAt) ? notificationAt - 15 * 60 * 1000 : Date.now() - 24 * 60 * 60 * 1000;

  return entries.flatMap((value: unknown) => {
    const comment = asRecord(value);
    const user = asRecord(comment.user);
    const author = stringValue(user.login);
    const createdAt = stringValue(comment.created_at);
    if (!author || !createdAt || Date.parse(createdAt) <= cutoff) return [];
    if (authorLogin && author.toLowerCase() === authorLogin.toLowerCase()) return [];
    if (stringValue(user.type).toLowerCase() === "bot" || /\[bot\]$/i.test(author)) return [];
    const body = reviewCommentExcerpt(stringValue(comment.body));
    if (!body) return [];
    return [{
      author,
      body,
      createdAt,
      path: stringValue(comment.path) || null,
      line: numberValue(comment.line) || numberValue(comment.original_line) || null,
    }];
  })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 12);
}

export async function markPullRequestRead(repository: string, number: number): Promise<boolean> {
  const attention = (await unreadPullRequestAttention()).get(pullRequestKey(repository, number));
  if (!attention?.threadId) return false;
  await exec("gh", ["api", "--method", "PATCH", `notifications/threads/${attention.threadId}`], { timeout: 30_000 });
  cache = null;
  return true;
}

function reviewCommentExcerpt(body: string): string {
  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<details>[\s\S]*?<\/details>/gi, " ")
    .replace(/[`*_>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 240 ? `${cleaned.slice(0, 240).trim()}…` : cleaned;
}

function repositoryName(workspace: Workspace): string {
  const origin = workspace.origin ?? "";
  const parts = origin.replace(/\.git$/, "").split("/").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join("/") : workspace.name;
}

function pullRequestKey(repository: string, number: number): string {
  return `${repository.toLowerCase()}#${number}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
