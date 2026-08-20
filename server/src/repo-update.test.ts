import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// repo-update reaches config, which opens the database at import time.
const stateDir = mkdtempSync(join(tmpdir(), "remy-repo-update-test-"));
process.env.MC_CONFIG_DIR = stateDir;
process.env.HOME = stateDir;

const { planFor } = await import("./repo-update.js");
const { repoUpdateInterval } = await import("./config.js");

const base = { dirty: false, branch: "main", upstream: "origin/main", ahead: 0, behind: 0 };

test("fast-forwards a clean checkout that is only behind", () => {
  assert.equal(planFor({ ...base, behind: 3 }), "fast-forward");
});

test("leaves a dirty checkout alone, however far behind it is", () => {
  // The fetch still happened; only the merge is skipped, because that is the
  // step that would touch someone's uncommitted work.
  assert.equal(planFor({ ...base, behind: 9, dirty: true }), "dirty");
});

test("never moves a branch that has local commits", () => {
  assert.equal(planFor({ ...base, ahead: 2, behind: 4 }), "diverged");
  assert.equal(planFor({ ...base, ahead: 2, behind: 4, dirty: true }), "diverged");
  // Ahead with nothing to pull is simply current — there is nothing to do.
  assert.equal(planFor({ ...base, ahead: 2 }), "current");
});

test("does nothing without a branch or an upstream to follow", () => {
  assert.equal(planFor({ ...base, branch: undefined }), "detached");
  assert.equal(planFor({ ...base, upstream: undefined, behind: 5 }), "no-upstream");
});

test("reports a checkout that is already level", () => {
  assert.equal(planFor(base), "current");
  assert.equal(planFor({ ...base, dirty: true }), "current");
});

test("turns each schedule into a gap, and off into none", () => {
  assert.equal(repoUpdateInterval("off"), undefined);
  assert.equal(repoUpdateInterval("hourly"), 3_600_000);
  assert.equal(repoUpdateInterval("sixHourly"), 21_600_000);
  assert.equal(repoUpdateInterval("daily"), 86_400_000);
});
