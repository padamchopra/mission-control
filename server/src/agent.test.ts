import assert from "node:assert/strict";
import test from "node:test";
import { inferAgent } from "./agent.js";

test("live agent processes override an initial shell classification", () => {
  assert.equal(inferAgent("zsh claude", "shell"), "claude");
  assert.equal(inferAgent("zsh codex", "shell"), "codex");
  assert.equal(inferAgent("zsh codex", "claude"), "codex");
  assert.equal(inferAgent("zsh", "claude"), "claude");
});
