import { homedir } from "node:os";
import { config, repoUpdateInterval } from "./config.js";
import { getKv, setKv } from "./db.js";
import { run as exec } from "./run.js";
import { listWorkspaces, worktreeDirty } from "./workspaces.js";

/// Keeps the repositories Remy knows about current, on a schedule you choose.
///
/// The rule is: never lose work, never surprise you. `git fetch` touches only
/// the object store and the remote-tracking refs, so it is safe on any
/// repository in any state and always runs. Moving the checkout itself is a
/// fast-forward, which git will only do from a clean tree onto a branch that
/// has not diverged — so that part is attempted only when it cannot fail.
///
/// Linked worktrees are left alone entirely: they are where work in progress
/// lives, and they share the object store the fetch just refreshed anyway.

export type UpdateResult =
  | "updated"
  | "current"
  | "dirty"
  | "no-upstream"
  | "diverged"
  | "detached"
  | "failed";

export interface RepoOutcome {
  workspace: string;
  path: string;
  result: UpdateResult;
  /// How far the checkout moved, or why it did not.
  detail?: string;
}

export interface UpdateRun {
  at: number;
  repos: RepoOutcome[];
}

/// What to do with a checkout, given what git says about it. Pure so the rule
/// itself can be tested without a repository on disk.
export function planFor(input: {
  dirty: boolean;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
}): Exclude<UpdateResult, "updated" | "failed"> | "fast-forward" {
  if (!input.branch) return "detached";
  if (!input.upstream) return "no-upstream";
  // Ahead means there are local commits the remote has not seen. Even with
  // nothing to pull, moving that branch is not this feature's business.
  if (input.ahead > 0) return input.behind > 0 ? "diverged" : "current";
  if (input.behind === 0) return "current";
  // Behind and nothing local to lose — but the merge still writes to the
  // working tree, so it needs that tree clean.
  return input.dirty ? "dirty" : "fast-forward";
}

async function git(cwd: string, args: string[], timeout = 60_000): Promise<string> {
  const { stdout } = await exec("git", ["-C", cwd, ...args], { cwd: homedir(), timeout });
  return stdout.trim();
}

async function tryGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    return await git(cwd, args);
  } catch {
    return undefined;
  }
}

async function updateCheckout(name: string, path: string): Promise<RepoOutcome> {
  try {
    // Always safe, and the point of the exercise: an up-to-date `origin/main`
    // is what a new worktree branches from.
    await git(path, ["fetch", "--prune", "--quiet"]);
  } catch (error) {
    return { workspace: name, path, result: "failed", detail: reason(error) };
  }

  const branch = await tryGit(path, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const upstream = branch
    ? await tryGit(path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
    : undefined;

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const counts = await tryGit(path, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
    const [left, right] = (counts ?? "0\t0").split(/\s+/).map((value) => Number(value) || 0);
    ahead = left;
    behind = right;
  }

  const dirty = upstream && behind > 0 ? await worktreeDirty(path) : false;
  const plan = planFor({ dirty, branch, upstream, ahead, behind });

  if (plan !== "fast-forward") {
    return { workspace: name, path, result: plan, detail: describe(plan, behind, upstream) };
  }

  try {
    await git(path, ["merge", "--ff-only", "@{u}"]);
    return {
      workspace: name,
      path,
      result: "updated",
      detail: `${behind} commit${behind === 1 ? "" : "s"} from ${upstream}`,
    };
  } catch (error) {
    return { workspace: name, path, result: "failed", detail: reason(error) };
  }
}

function describe(plan: UpdateResult, behind: number, upstream?: string): string | undefined {
  if (plan === "current") return upstream ? `Up to date with ${upstream}` : undefined;
  if (plan === "dirty") return `${behind} commit${behind === 1 ? "" : "s"} behind, but the checkout has changes`;
  if (plan === "no-upstream") return "The branch tracks no remote";
  if (plan === "detached") return "Not on a branch";
  if (plan === "diverged") return "Local commits the remote does not have";
  return undefined;
}

function reason(error: unknown): string {
  const detail = (error as { stderr?: unknown })?.stderr ?? (error as Error)?.message ?? "";
  return String(detail).split("\n").map((line) => line.trim()).filter(Boolean)[0]?.slice(0, 200) ?? "git failed";
}

/// Refreshes every registered repository's primary checkout, one at a time so a
/// fleet of repositories cannot saturate the machine.
export async function updateRepositories(): Promise<UpdateRun> {
  const workspaces = await listWorkspaces();
  const repos: RepoOutcome[] = [];
  for (const workspace of workspaces) {
    const main = workspace.worktrees.find((tree) => tree.isMain)?.path;
    if (!main) continue;
    repos.push(await updateCheckout(workspace.name, main));
  }
  const run: UpdateRun = { at: Date.now(), repos };
  setKv("repoUpdateRun", run);
  return run;
}

export function lastUpdateRun(): UpdateRun | undefined {
  return getKv<UpdateRun>("repoUpdateRun");
}

let timer: ReturnType<typeof setInterval> | undefined;

/// Applies the current setting. Called at boot and whenever it changes, so
/// turning the schedule off stops the timer rather than waiting it out.
export function syncRepoUpdateSchedule(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
  const every = repoUpdateInterval(config.repoUpdate);
  if (!every) return;
  timer = setInterval(() => {
    void updateRepositories().catch(() => {
      // Every repository already reports its own failure into the last run.
    });
  }, every);
  timer.unref?.();
}
