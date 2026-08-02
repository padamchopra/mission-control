import assert from "node:assert/strict";
import test from "node:test";
import { descendantCommandsForRoots, paneScrollIsAvailable } from "./tmux.js";

test("collects nested agent commands beneath a tmux shell", () => {
  const processes = `
  100   1 zsh
  200 100 claude
  201 200 claude-helper
  300   1 zsh
  301 300 codex
  `;

  const result = descendantCommandsForRoots(processes, [100, 300]);
  assert.deepEqual(result.get(100), ["claude", "claude-helper"]);
  assert.deepEqual(result.get(300), ["codex"]);
});

test("allows scrollback for alternate-screen panes with tmux history", () => {
  assert.equal(paneScrollIsAvailable("0\x1f1\x1f42", "up"), true);
});

test("does not enter copy mode without tmux history", () => {
  assert.equal(paneScrollIsAvailable("0\x1f0\x1f0", "up"), false);
  assert.equal(paneScrollIsAvailable("0\x1f1\x1f0", "up"), false);
});
