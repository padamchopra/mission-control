import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.HOME = mkdtempSync(join(tmpdir(), "mission-control-workspaces-test-"));

const { isLegacyManagedWorktreePath } = await import("./workspaces.js");

test("recognizes only Mission Control's legacy sibling worktree directory", () => {
  const workspace = "/code/mobile";

  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile-worktrees/pr-7211"), true);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile-worktrees/nested/pr-7211"), true);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile-worktrees-other/pr-7211"), false);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/custom-worktrees/pr-7211"), false);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile/.claude/worktrees/pr-7211"), false);
  assert.equal(isLegacyManagedWorktreePath(workspace, "/code/mobile-worktrees"), false);
});
