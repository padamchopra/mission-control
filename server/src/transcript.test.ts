import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const home = mkdtempSync(join(tmpdir(), "mission-control-transcript-test-"));
process.env.HOME = home;

const { discoverClaudeTranscript } = await import("./transcript.js");

test("discovers the newest Claude transcript for an exact working directory", () => {
  const cwd = "/code/control/.claude/worktrees/feature/flight-deck";
  const encoded = cwd.replace(/[/.]/g, "-");
  const directory = join(home, ".claude", "projects", encoded);
  mkdirSync(directory, { recursive: true });
  const older = join(directory, "older.jsonl");
  const current = join(directory, "current.jsonl");
  writeFileSync(older, "{}\n");
  writeFileSync(current, "{}\n");
  utimesSync(older, new Date(1_000), new Date(1_000));
  utimesSync(current, new Date(2_000), new Date(2_000));

  assert.deepEqual(discoverClaudeTranscript(cwd), { path: current, sessionId: "current" });
  assert.equal(discoverClaudeTranscript("/code/other"), undefined);
});
