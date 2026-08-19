import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.HOME = mkdtempSync(join(tmpdir(), "remy-events-test-"));

const { handleHookEvent } = await import("./events.js");
const { registry } = await import("./registry.js");

test("AskUserQuestion enters needs_input at PreToolUse and resumes after its result", async () => {
  const session = "ask-user-question-test";
  registry.setNotificationsMuted(session, true);

  await handleHookEvent(session, "PreToolUse", {
    session_id: "claude-session",
    tool_name: "AskUserQuestion",
    tool_use_id: "toolu_question",
    tool_input: {
      questions: [{ question: "Which implementation should I use?" }],
    },
  }, "claude");

  assert.equal(registry.view(session)?.state, "needs_input");
  assert.equal(registry.view(session)?.detail, "Which implementation should I use?");
  assert.equal(registry.view(session)?.interactionKind, "ask_user_question");
  assert.equal(registry.view(session)?.interactionRequestId, "toolu_question");

  await handleHookEvent(session, "PostToolUse", {
    session_id: "claude-session",
    tool_name: "AskUserQuestion",
  }, "claude");

  assert.equal(registry.view(session)?.state, "working");
  assert.equal(registry.view(session)?.detail, undefined);
  assert.equal(registry.view(session)?.interactionKind, undefined);
  assert.equal(registry.view(session)?.interactionRequestId, undefined);
});
