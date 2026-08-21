import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  codexArgs,
  codexEntry,
  codexTodos,
  codexTokens,
  parseCodexEvent,
  runCodexTurn,
  type CodexEvent,
  type CodexItem,
} from "./codex.js";

const base = { command: "/usr/local/bin/codex", prompt: "do the thing", cwd: "/repo" };

test("a first turn is read-only until you say otherwise", () => {
  const args = codexArgs({ ...base, permissionMode: "default" });
  assert.deepEqual(args, [
    "exec",
    "--experimental-json",
    "--sandbox",
    "read-only",
    "--cd",
    "/repo",
    "--skip-git-repo-check",
    "--config",
    'approval_policy="never"',
  ]);
});

test("accepting edits is what lets it write, and reach the network to do it", () => {
  const args = codexArgs({ ...base, permissionMode: "acceptEdits", model: "gpt-5.6-terra" });
  assert.deepEqual(args.slice(0, 6), [
    "exec",
    "--experimental-json",
    "--model",
    "gpt-5.6-terra",
    "--sandbox",
    "workspace-write",
  ]);
  assert.ok(args.includes("sandbox_workspace_write.network_access=true"));
});

test("bypassing permissions drops the sandbox", () => {
  const args = codexArgs({ ...base, permissionMode: "bypassPermissions" });
  assert.ok(args.includes("danger-full-access"));
});

test("resuming names the thread after every flag it applies to", () => {
  const args = codexArgs({
    ...base,
    permissionMode: "plan",
    threadId: "thread-9",
    additionalDirectories: ["/uploads"],
  });
  assert.deepEqual(args.slice(-2), ["resume", "thread-9"]);
  assert.deepEqual(args.slice(6, 8), ["--add-dir", "/uploads"]);
});

test("a Remy MCP is scoped to the current thread", () => {
  const args = codexArgs({
    ...base,
    permissionMode: "plan",
    mcpServer: {
      command: "/usr/local/bin/node",
      args: ["/app/ticket-mcp.js"],
      env: { REMY_CHAT_ID: "chat-1", REMY_API_TOKEN: "secret" },
    },
  });
  assert.ok(args.includes('mcp_servers.remy.command="/usr/local/bin/node"'));
  assert.ok(args.includes('mcp_servers.remy.args=["/app/ticket-mcp.js"]'));
  assert.ok(args.includes('mcp_servers.remy.env_vars=["REMY_CHAT_ID","REMY_API_TOKEN"]'));
  assert.ok(!args.some((arg) => arg.includes("secret")));
  assert.ok(args.includes('mcp_servers.remy.default_tools_approval_mode="approve"'));
});

test("a line that is not an event is skipped rather than fatal", () => {
  assert.equal(parseCodexEvent("Reading files…"), undefined);
  assert.equal(parseCodexEvent("{ not json"), undefined);
  assert.equal(parseCodexEvent("{}"), undefined);
  assert.deepEqual(parseCodexEvent('{"type":"turn.started"}'), { type: "turn.started" });
});

test("each turn's items are its own, so a second turn adds rather than overwrites", () => {
  const item: CodexItem = { id: "item_0", type: "agent_message", text: "Done." };
  assert.equal(codexEntry(item, "aaaa-")?.id, "aaaa-item_0");
  assert.notEqual(codexEntry(item, "aaaa-")?.id, codexEntry(item, "bbbb-")?.id);
});

test("an answer and its reasoning land as their own kinds", () => {
  assert.deepEqual(codexEntry({ id: "i1", type: "agent_message", text: "Done." }), {
    id: "i1",
    kind: "assistant",
    text: "Done.",
  });
  assert.equal(codexEntry({ id: "i2", type: "reasoning", text: "Thinking" })?.kind, "thinking");
});

test("a command reads as one tool line that gains its output", () => {
  const running: CodexItem = {
    id: "c1",
    type: "command_execution",
    command: "npm test",
    status: "in_progress",
  };
  const started = codexEntry(running);
  assert.equal(started?.verb, "Ran");
  assert.equal(started?.arg, "npm test");
  assert.equal(started?.status, undefined);

  const done = codexEntry({ ...running, status: "completed", exit_code: 0, aggregated_output: "111 passing" });
  assert.equal(done?.id, "c1");
  assert.equal(done?.status, "ok");
  assert.equal(done?.output, "111 passing");

  const failed = codexEntry({ ...running, status: "completed", exit_code: 1, aggregated_output: "1 failing" });
  assert.equal(failed?.status, "error");
});

test("a patch says which file, or how many", () => {
  const one = codexEntry({
    id: "f1",
    type: "file_change",
    status: "completed",
    changes: [{ path: "/repo/web/src/App.tsx", kind: "update" }],
  });
  assert.equal(one?.verb, "Edited");
  assert.equal(one?.arg, "App.tsx");
  assert.equal(one?.file, "/repo/web/src/App.tsx");

  const many = codexEntry({
    id: "f2",
    type: "file_change",
    status: "completed",
    changes: [
      { path: "a.ts", kind: "add" },
      { path: "b.ts", kind: "delete" },
    ],
  });
  assert.equal(many?.arg, "2 files");
  assert.equal(many?.file, undefined);
});

test("the plan is the thread's plan, not a line in its feed", () => {
  const item: CodexItem = {
    id: "t1",
    type: "todo_list",
    items: [
      { text: "Read the tests", completed: true },
      { text: "Fix the bug", completed: false },
    ],
  };
  assert.equal(codexEntry(item), undefined);
  assert.deepEqual(codexTodos(item), [
    { content: "Read the tests", status: "completed" },
    { content: "Fix the bug", status: "pending" },
  ]);
});

test("both halves of the prompt are occupying the window", () => {
  assert.equal(codexTokens({ input_tokens: 1_000, cached_input_tokens: 9_000, output_tokens: 200 }), 10_000);
  assert.equal(codexTokens(undefined), 0);
});

/// A stand-in for the Codex binary. `runCodexTurn` spawns whatever it is given,
/// so a script that speaks the same JSONL is enough to exercise the whole turn —
/// the prompt on stdin, the events out, and how it ends.
function fakeCodex(body: string): string {
  const directory = mkdtempSync(join(tmpdir(), "remy-codex-"));
  const file = join(directory, "codex");
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return file;
}

test("a turn reads the prompt on stdin and reports every event before it ends", async () => {
  // 200 lines and an immediate exit: a turn that only waited for the process
  // would settle with the tail still buffered.
  const command = fakeCodex(`
    const prompt = require("node:fs").readFileSync(0, "utf8").trim();
    process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "thr_1" }) + "\\n");
    for (let i = 0; i < 200; i += 1) {
      process.stdout.write(JSON.stringify({ type: "item.completed", item: { id: "m" + i, type: "agent_message", text: prompt } }) + "\\n");
    }
    process.stdout.write("about to finish\\n");
    process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 7, cached_input_tokens: 3, output_tokens: 1 } }) + "\\n");
  `);
  const events: CodexEvent[] = [];
  const run = runCodexTurn(
    { command, prompt: "hello codex", cwd: process.cwd(), permissionMode: "plan" },
    (event) => events.push(event),
  );
  await run.done;

  assert.equal(events.length, 202, "every event, and only the events");
  assert.deepEqual(events[0], { type: "thread.started", thread_id: "thr_1" });
  assert.equal(events.at(-1)?.type, "turn.completed");
  const answer = events[1];
  assert.equal(answer.type === "item.completed" && answer.item.type === "agent_message" && answer.item.text, "hello codex");
});

test("a turn that fails ends with what Codex said, not an exit code", async () => {
  const command = fakeCodex(`
    process.stderr.write("stream error: model not found\\n");
    process.exit(1);
  `);
  const run = runCodexTurn(
    { command, prompt: "hi", cwd: process.cwd(), permissionMode: "plan" },
    () => {},
  );
  await assert.rejects(run.done, /model not found/);
});

test("a missing Codex is a message rather than a hang", async () => {
  const run = runCodexTurn(
    { command: join(tmpdir(), "definitely-not-codex"), prompt: "hi", cwd: process.cwd(), permissionMode: "plan" },
    () => {},
  );
  await assert.rejects(run.done, /could not be started/);
});

test("stopping a turn settles it rather than failing it", async () => {
  const command = fakeCodex(`
    process.stdout.write(JSON.stringify({ type: "turn.started" }) + "\\n");
    setTimeout(() => {}, 30000);
  `);
  const run = runCodexTurn(
    { command, prompt: "hi", cwd: process.cwd(), permissionMode: "plan" },
    () => {},
  );
  setTimeout(() => run.stop(), 200);
  await run.done;
});
