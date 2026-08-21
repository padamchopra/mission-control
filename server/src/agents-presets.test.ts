import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.MC_CONFIG_DIR = mkdtempSync(join(tmpdir(), "remy-agent-presets-"));
const agents = await import("./agents.js");

test("untouched legacy defaults upgrade to the PM, Builder, and QA chain", () => {
  agents.createAgent({ name: "Scout", handle: "scout", preset: "scout", handoffTo: ["builder"] });
  agents.createAgent({ name: "Builder", handle: "builder", preset: "builder", handoffTo: ["critic"] });
  agents.createAgent({ name: "Critic", handle: "critic", preset: "critic", handoffTo: ["builder"] });
  agents.createAgent({ name: "Triager", handle: "triager", preset: "triager" });

  agents.seedPresetAgents();

  assert.equal(agents.agentByHandle("scout"), undefined);
  assert.equal(agents.agentByHandle("critic"), undefined);
  assert.equal(agents.agentByHandle("pm")?.handoffTo[0], "builder");
  assert.equal(agents.agentByHandle("builder")?.handoffTo[0], "qa");
  assert.equal(agents.agentByHandle("qa")?.handoffTo[0], "builder");
  assert.ok(agents.agentByHandle("triager"), "an existing Triager should not be deleted");
});
