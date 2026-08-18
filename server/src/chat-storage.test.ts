import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import type { ConvEntry } from "./transcript.js";
// Type-only, so it is erased at compile time and does not open the database
// before the directory override below takes effect.
import type { ChatRow, StoredChat } from "./chat-storage.js";

// The storage module opens its database at import time against `configDir`, so
// the whole suite runs against a throwaway directory. node:test gives each file
// its own process, so setting this here cannot leak into another test file.
const stateDir = mkdtempSync(join(tmpdir(), "mc-chat-storage-"));
process.env.MC_CONFIG_DIR = stateDir;

// Imported after the override so config.ts resolves to the temp directory.
const storage = await import("./chat-storage.js");

function entry(id: string, text: string): ConvEntry {
  return { id, kind: "assistant", text };
}

function chat(id: string, overrides: Partial<ChatRow> = {}): ChatRow {
  return {
    id,
    title: `Chat ${id}`,
    cwd: "/tmp",
    permissionMode: "default",
    createdAt: 1,
    updatedAt: 2,
    turns: 0,
    todos: [],
    ...overrides,
  };
}

test("stores a chat and reads it back with its feed in order", () => {
  assert.equal(storage.chatStorageAvailable(), true, storage.chatStorageError() ?? "");
  storage.saveChat(chat("a", { model: "opus", claudeSessionId: "session-1", turns: 3, costUsd: 0.5 }));
  storage.saveEntry("a", entry("e1", "first"));
  storage.saveEntry("a", entry("e2", "second"));
  storage.saveEntry("a", entry("e3", "third"));

  const loaded = storage.loadChats(100).find((c) => c.id === "a");
  assert.ok(loaded);
  assert.equal(loaded.model, "opus");
  assert.equal(loaded.claudeSessionId, "session-1");
  assert.equal(loaded.turns, 3);
  assert.equal(loaded.costUsd, 0.5);
  assert.deepEqual(loaded.entries.map((e) => e.id), ["e1", "e2", "e3"]);
});

test("re-saving an entry updates it in place, keeping its position", () => {
  storage.saveChat(chat("b"));
  storage.saveEntry("b", entry("s1", "partial"));
  storage.saveEntry("b", entry("s2", "after"));
  // What a streaming block does: same id, more text, over and over.
  storage.saveEntry("b", entry("s1", "partial and then some"));

  const loaded = storage.loadChats(100).find((c) => c.id === "b");
  assert.deepEqual(loaded?.entries.map((e) => e.id), ["s1", "s2"]);
  assert.equal(loaded?.entries[0]?.text, "partial and then some");
});

test("the entry limit keeps the newest entries", () => {
  storage.saveChat(chat("c"));
  for (let i = 1; i <= 10; i += 1) storage.saveEntry("c", entry(`n${i}`, `line ${i}`));

  const loaded = storage.loadChats(3).find((c) => c.id === "c");
  assert.deepEqual(loaded?.entries.map((e) => e.id), ["n8", "n9", "n10"]);
});

test("trimming drops the oldest entries and leaves the rest ordered", () => {
  storage.saveChat(chat("d"));
  for (let i = 1; i <= 6; i += 1) storage.saveEntry("d", entry(`t${i}`, `line ${i}`));
  storage.trimEntries("d", 2);

  const loaded = storage.loadChats(100).find((c) => c.id === "d");
  assert.deepEqual(loaded?.entries.map((e) => e.id), ["t5", "t6"]);
});

test("deleting entries and chats removes them", () => {
  storage.saveChat(chat("e"));
  storage.saveEntry("e", entry("x1", "one"));
  storage.saveEntry("e", entry("x2", "two"));
  storage.deleteEntries("e", ["x1"]);
  assert.deepEqual(
    storage.loadChats(100).find((c) => c.id === "e")?.entries.map((x) => x.id),
    ["x2"],
  );

  storage.removeChat("e");
  assert.equal(storage.loadChats(100).some((c) => c.id === "e"), false);
});

test("newest chat first", () => {
  storage.saveChat(chat("old", { updatedAt: 1_000 }));
  storage.saveChat(chat("new", { updatedAt: 2_000 }));
  const ids = storage.loadChats(1).map((c) => c.id);
  assert.ok(ids.indexOf("new") < ids.indexOf("old"));
});

// The upgrade path: chats used to be one JSON file each. A server that has them
// must bring them across on first boot and keep the originals. This only ever
// happens at boot, and `configDir` is resolved once per process, so the test
// runs it the way a real server does: in a fresh process.
test("imports the JSON layout a previous build wrote", () => {
  const legacyState = mkdtempSync(join(tmpdir(), "mc-chat-legacy-"));
  const legacyChats = join(legacyState, "chats");
  mkdirSync(legacyChats, { recursive: true });
  writeFileSync(
    join(legacyChats, "old-chat.json"),
    JSON.stringify({
      id: "old-chat",
      title: "From JSON",
      cwd: "/tmp",
      permissionMode: "plan",
      createdAt: 5,
      updatedAt: 6,
      claudeSessionId: "resume-me",
      turns: 2,
      todos: [{ content: "ship it", status: "pending" }],
      entries: [entry("j1", "hello"), entry("j2", "world")],
    }),
  );
  // A corrupt file must not stop the rest of the import.
  writeFileSync(join(legacyChats, "broken.json"), "{ not json");

  const moduleUrl = pathToFileURL(join(import.meta.dirname, "chat-storage.js")).href;
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const s = await import(${JSON.stringify(moduleUrl)});
       process.stdout.write("RESULT:" + JSON.stringify(s.loadChats(100)));`,
    ],
    { env: { ...process.env, MC_CONFIG_DIR: legacyState }, encoding: "utf8" },
  );
  const chats = JSON.parse(output.slice(output.indexOf("RESULT:") + "RESULT:".length)) as StoredChat[];

  const loaded = chats.find((c) => c.id === "old-chat");
  assert.ok(loaded, "the JSON chat should have been imported");
  assert.equal(loaded.title, "From JSON");
  assert.equal(loaded.permissionMode, "plan");
  assert.equal(loaded.claudeSessionId, "resume-me");
  assert.deepEqual(loaded.todos, [{ content: "ship it", status: "pending" }]);
  assert.deepEqual(loaded.entries.map((e) => e.id), ["j1", "j2"]);
  // The originals are moved aside, never deleted.
  assert.equal(existsSync(legacyChats), false);
  assert.ok(readdirSync(legacyState).some((name) => name.startsWith("chats-imported-")));
});
