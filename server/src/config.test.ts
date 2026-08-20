import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// config.ts opens the database at import time, so the whole suite runs against
// a throwaway directory. node:test gives each file its own process.
const stateDir = mkdtempSync(join(tmpdir(), "remy-config-test-"));
process.env.MC_CONFIG_DIR = stateDir;
process.env.HOME = stateDir;

const { patchSettings, publicSettings, worktreeRootPath } = await import("./config.js");

test("takes a worktree root only when it is somewhere git can write", () => {
  assert.equal(worktreeRootPath("/vol/trees"), "/vol/trees");
  assert.equal(worktreeRootPath("/vol/trees/"), "/vol/trees");
  assert.equal(worktreeRootPath("~/trees"), join(stateDir, "trees"));
  assert.equal(worktreeRootPath("~"), stateDir);
  // A relative path would resolve against whatever the server's cwd happens to
  // be, so it is refused rather than guessed at.
  assert.equal(worktreeRootPath("trees"), "");
  assert.equal(worktreeRootPath("  "), "");
  assert.equal(worktreeRootPath(undefined), "");
  assert.equal(worktreeRootPath(42), "");
});

test("starts on the defaults a fresh install should have", () => {
  const settings = publicSettings();
  assert.equal(settings.defaultCheckout, "main");
  assert.equal(settings.worktreeBase, "remote");
  assert.equal(settings.worktreeRoot, "");
  assert.equal(settings.defaultModel, "");
  // Remy's own jobs are small and frequent, so they start on the cheap model
  // rather than on whatever the chats are using.
  assert.equal(settings.remyModel, "haiku");
});

test("keeps Remy's own model separate from the chat default", () => {
  patchSettings({ defaultModel: "opus" });
  assert.equal(publicSettings().remyModel, "haiku");
  patchSettings({ remyModel: "sonnet" });
  assert.equal(publicSettings().defaultModel, "opus");
  assert.equal(publicSettings().remyModel, "sonnet");
});

test("patches only the keys the caller sent", () => {
  patchSettings({ defaultCheckout: "worktree", defaultModel: "opus" });
  assert.equal(publicSettings().defaultCheckout, "worktree");
  assert.equal(publicSettings().defaultModel, "opus");

  // A client that knows about one setting must not reset the others.
  patchSettings({ worktreeBase: "local" });
  assert.equal(publicSettings().worktreeBase, "local");
  assert.equal(publicSettings().defaultCheckout, "worktree");
  assert.equal(publicSettings().defaultModel, "opus");
});

test("keeps the current value when a patch is not a value it knows", () => {
  patchSettings({ defaultCheckout: "worktree" });
  patchSettings({ defaultCheckout: "nonsense" });
  assert.equal(publicSettings().defaultCheckout, "worktree");

  patchSettings({ defaultModel: "gpt-4" });
  assert.equal(publicSettings().defaultModel, "opus");
});

test("survives a round trip through the database", async () => {
  patchSettings({ worktreeRoot: "/vol/trees", defaultModel: "haiku" });
  // A second module instance reads the same row a restart would.
  const reloaded = await import(`./config.js?reload=${Date.now()}`);
  assert.equal(reloaded.publicSettings().worktreeRoot, "/vol/trees");
  assert.equal(reloaded.publicSettings().defaultModel, "haiku");
});
