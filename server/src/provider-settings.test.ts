import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const stateDir = mkdtempSync(join(tmpdir(), "remy-provider-settings-"));
process.env.MC_CONFIG_DIR = stateDir;
process.env.HOME = stateDir;

const { createAgent, getAgent } = await import("./agents.js");
const { patchSettings } = await import("./config.js");
const { setProviderEnabled } = await import("./provider-settings.js");
const { addWorkspace, listWorkspaces, updateWorkspace } = await import("./workspaces.js");

test("disabled provider overrides return to Remy's default", async () => {
  const agent = createAgent({ name: "Cloud", provider: "cursor", model: "auto" });
  const path = mkdtempSync(join(tmpdir(), "remy-provider-workspace-"));
  const workspace = await addWorkspace("Cloud", path);
  await updateWorkspace(workspace.id, { provider: "cursor", model: "auto" });
  patchSettings({ defaultProvider: "cursor", defaultModel: "auto" });

  const settings = setProviderEnabled("cursor", false);

  assert.equal(settings.defaultProvider, "claude");
  assert.equal(getAgent(agent.id)?.provider, "default");
  const saved = (await listWorkspaces()).find((entry) => entry.id === workspace.id);
  assert.equal(saved?.provider, null);
  assert.equal(saved?.model, null);
});
