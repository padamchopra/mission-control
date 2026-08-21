import assert from "node:assert/strict";
import test from "node:test";
import { claudeModels, codexModels } from "./provider-discovery.js";

test("Claude's SDK names the installed generations and context windows", () => {
  const models = claudeModels([
    {
      value: "default",
      resolvedModel: "claude-opus-5[1m]",
      displayName: "Default (recommended)",
      description: "Use the default model (currently Opus 5 (1M context))",
    },
    {
      value: "sonnet",
      resolvedModel: "claude-sonnet-5",
      displayName: "Sonnet",
      description: "Sonnet 5 · Efficient for routine tasks",
    },
  ]);

  assert.deepEqual(models[0], { value: "", label: "Default", resolvedLabel: "Opus 5 (1M)" });
  assert.equal(models[1]?.label, "Sonnet 5");
  assert.equal(models[1]?.context, "200K");
});

test("Claude generation decimals stay decimals", () => {
  const [haiku] = claudeModels([{
    value: "haiku",
    resolvedModel: "claude-haiku-4-5-20251001",
    displayName: "Haiku",
    description: "Haiku 4.5 · Fastest for quick answers",
  }]);
  assert.equal(haiku?.label, "Haiku 4.5");
});

test("Codex app-server models keep its live names and default", () => {
  const models = codexModels([
    { model: "gpt-5.6-sol", displayName: "GPT-5.6-Sol", isDefault: true, hidden: false },
    { model: "hidden", displayName: "Hidden", hidden: true },
  ]);

  assert.deepEqual(models[0], { value: "", label: "Default", resolvedLabel: "GPT-5.6 Sol" });
  assert.equal(models[1]?.label, "GPT-5.6 Sol");
  assert.equal(models.length, 2);
});
