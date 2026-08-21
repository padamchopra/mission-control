import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const stateDir = mkdtempSync(join(tmpdir(), "remy-push-test-"));
process.env.MC_CONFIG_DIR = stateDir;
process.env.HOME = stateDir;

const { forgetPushDevice, listPushDevices, pushStatus, registerPushDevice } = await import("./push.js");

const TOKEN = "ab".repeat(32);
const OTHER = "cd".repeat(32);

test("registers a phone by its token and keeps one row per token", () => {
  const first = registerPushDevice({ token: TOKEN, name: "Padam's iPhone" });
  assert.equal(first.token, TOKEN);
  assert.equal(first.name, "Padam's iPhone");
  const again = registerPushDevice({ token: TOKEN.toUpperCase(), name: "iPhone" });
  assert.equal(again.token, TOKEN);
  assert.equal(again.name, "iPhone");
  assert.equal(again.registeredAt, first.registeredAt);
  assert.equal(listPushDevices().length, 1);
});

test("names a nameless phone iPhone", () => {
  const device = registerPushDevice({ token: OTHER });
  assert.equal(device.name, "iPhone");
});

test("refuses a token Apple would not accept", () => {
  assert.throws(() => registerPushDevice({ token: "nope" }), /not an Apple Push token/);
});

test("forgets a phone by token", () => {
  assert.equal(forgetPushDevice(OTHER), true);
  assert.equal(listPushDevices().some((device) => device.token === OTHER), false);
  assert.equal(forgetPushDevice(OTHER), false);
});

test("says whether Apple Push is configured without exposing the key", () => {
  const status = pushStatus();
  assert.equal(status.configured, false);
  assert.ok(Array.isArray(status.devices));
});
