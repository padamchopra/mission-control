import assert from "node:assert/strict";
import test from "node:test";

import { QuestionBroker } from "./questions.js";

test("answers a structured AskUserQuestion through PreToolUse updatedInput", async () => {
  const broker = new QuestionBroker();
  const pending = broker.open("session-one", {
    tool_use_id: "toolu_123",
    tool_input: {
      questions: [{
        header: "Approach",
        question: "Which implementation?",
        multiSelect: false,
        options: [
          { label: "Small fix", description: "Change only the parser" },
          { label: "Larger refactor", description: "Replace the pipeline" },
        ],
      }],
    },
  });

  assert.equal(broker.view("session-one")?.requestId, "toolu_123");
  assert.equal(broker.view("session-one")?.questions[0]?.options[1]?.description, "Replace the pipeline");

  broker.respond("session-one", "toolu_123", { "Which implementation?": "Small fix" });

  assert.deepEqual(await pending.result, {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: {
        questions: [{
          header: "Approach",
          question: "Which implementation?",
          multiSelect: false,
          options: [
            { label: "Small fix", description: "Change only the parser" },
            { label: "Larger refactor", description: "Replace the pipeline" },
          ],
        }],
        answers: { "Which implementation?": "Small fix" },
      },
    },
  });
  assert.equal(broker.view("session-one"), undefined);
});

test("requires one answer for every question and rejects stale request ids", async () => {
  const broker = new QuestionBroker();
  const pending = broker.open("session-two", {
    tool_use_id: "toolu_456",
    tool_input: {
      questions: [
        { question: "First question?", options: [{ label: "A" }] },
        { question: "Second question?", options: [{ label: "B" }] },
      ],
    },
  });

  assert.throws(
    () => broker.respond("session-two", "wrong", {}),
    /no longer waiting/,
  );
  assert.throws(
    () => broker.respond("session-two", "toolu_456", { "First question?": "A" }),
    /missing answer for: Second question\?/,
  );
  broker.cancel("session-two");
  await assert.rejects(pending.result, /hook disconnected/);
});

test("preserves provider question keys and option labels exactly", async () => {
  const broker = new QuestionBroker();
  const pending = broker.open("session-three", {
    tool_use_id: "toolu_exact",
    tool_input: {
      questions: [{
        question: "  Keep this question verbatim?  ",
        options: [{ label: "  Exact label  " }],
      }],
    },
  });

  broker.respond("session-three", "toolu_exact", {
    "  Keep this question verbatim?  ": "  Exact label  ",
  });
  const response: any = await pending.result;
  assert.deepEqual(response.hookSpecificOutput.updatedInput.answers, {
    "  Keep this question verbatim?  ": "  Exact label  ",
  });
});
