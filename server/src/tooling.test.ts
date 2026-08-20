import assert from "node:assert/strict";
import test from "node:test";

import { readGhAuth } from "./tooling.js";

test("reads the signed-in account out of gh auth status", () => {
  const output = [
    "github.com",
    "  ✓ Logged in to github.com account padamchopra (keyring)",
    "  - Active account: true",
    "  - Token scopes: 'gist', 'read:org', 'repo'",
  ].join("\n");
  assert.deepEqual(readGhAuth(output), { authenticated: true, account: "padamchopra" });
});

test("reads the older phrasing that says as instead of account", () => {
  assert.deepEqual(readGhAuth("  ✓ Logged in to github.com as padamchopra (oauth_token)"), {
    authenticated: true,
    account: "padamchopra",
  });
});

test("reports signed out rather than guessing an account", () => {
  const output = "You are not logged into any GitHub hosts. To log in, run: gh auth login";
  assert.deepEqual(readGhAuth(output), { authenticated: false });
  assert.deepEqual(readGhAuth(""), { authenticated: false });
});
