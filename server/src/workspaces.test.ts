import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.HOME = mkdtempSync(join(tmpdir(), "remy-workspaces-test-"));

const { isLegacyManagedWorktreePath, plannedWorktreePath } = await import("./workspaces.js");

test("recognizes only Remy's legacy sibling worktree directory", () => {
  const workspace = "/code/mobile";

  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile-worktrees/pr-7211"), true);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile-worktrees/nested/pr-7211"), true);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile-worktrees-other/pr-7211"), false);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/custom-worktrees/pr-7211"), false);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile/.claude/worktrees/pr-7211"), false);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile-worktrees"), false);
});

test("keeps new worktrees in .remy inside the workspace by default", () => {
  assert.equal(plannedWorktreePath("/code/mobile", "pr-7211", ""), "/code/mobile/.remy/pr-7211");
  // A root that is the workspace itself must not nest the repo name twice.
  assert.equal(plannedWorktreePath("/code/mobile", "pr-7211", "/code/mobile"), "/code/mobile/.remy/pr-7211");
  assert.equal(plannedWorktreePath("/code/mobile", "feature/login", ""), "/code/mobile/.remy/feature/login");
});

test("separates repositories inside a shared worktree root", () => {
  assert.equal(plannedWorktreePath("/code/mobile", "main", "/vol/trees"), "/vol/trees/.remy/mobile/main");
  // Two repositories with the same branch name must not collide.
  assert.notEqual(
    plannedWorktreePath("/code/mobile", "main", "/vol/trees"),
    plannedWorktreePath("/code/web", "main", "/vol/trees"),
  );
});
