import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ConvEntry } from "./transcript.js";

process.env.MC_CONFIG_DIR = mkdtempSync(join(tmpdir(), "remy-chat-entries-"));
const { redactEntry } = await import("./chat.js");

// A streamed message arrives as one object that four places hold at once: the
// open block the deltas append to, the feed array, the id map the socket reads,
// and the row the database writes. Redaction runs over it on the way past. If
// it ever hands back a copy, the deltas keep growing an object nobody reads any
// more, and the feed keeps a message cut off after its first chunk.

test("redaction hands back the entry it was given, not a copy of it", () => {
  const entry: ConvEntry = { id: "e1", kind: "assistant", text: "Meas" };
  assert.equal(redactEntry(entry), entry);
});

test("a streaming message that grows after redaction keeps every chunk", () => {
  const streaming: ConvEntry = { id: "e1", kind: "assistant", text: "" };
  // The block the provider is still writing into.
  const open = streaming;
  // What the feed and the socket hold, which is whatever redaction returned.
  const feed = redactEntry(streaming);

  open.text += "Meas";
  open.text += "uring the two runs against each other.";

  assert.equal(feed.text, "Measuring the two runs against each other.");
});

test("redaction still reaches every field it is meant to", () => {
  const entry: ConvEntry = {
    id: "e2",
    kind: "tool",
    text: "text",
    arg: "arg",
    output: "output",
    diff: [{ kind: "add", text: "line" }],
    questions: [
      {
        question: "which",
        options: [{ label: "one", description: "first", preview: "code" }],
        answer: "other",
        notes: "note",
      },
    ],
  };

  const redacted = redactEntry(entry);

  // Nothing is configured to redact in this test's state, so the point is that
  // every field survived the pass rather than being dropped by it.
  assert.equal(redacted.text, "text");
  assert.equal(redacted.arg, "arg");
  assert.equal(redacted.output, "output");
  assert.equal(redacted.diff?.[0].text, "line");
  assert.equal(redacted.questions?.[0].question, "which");
  assert.equal(redacted.questions?.[0].answer, "other");
  assert.equal(redacted.questions?.[0].notes, "note");
  assert.equal(redacted.questions?.[0].options[0].label, "one");
  assert.equal(redacted.questions?.[0].options[0].description, "first");
  assert.equal(redacted.questions?.[0].options[0].preview, "code");
});
