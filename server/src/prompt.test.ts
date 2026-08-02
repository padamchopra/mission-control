import assert from "node:assert/strict";
import test from "node:test";

import { highlightedIndex, parsePanePrompt } from "./prompt.js";

const screenshotPrompt = `
jupbot re-posted its 3 P2 parser findings verbatim (new threads) after you'd already dispositioned and resolved the
originals as cross-platform follow-ups. How should I handle the duplicates?

› 1. Reply + resolve, keep disposition (Recommended)
     Post a short reply on each new thread pointing at the original disposition and resolve them. No code change.
  2. Implement the three fixes now
     Make the parser quote-state-aware, require a paired closing tag, and defer tag-stripping to settle.
  3. Leave them untouched
     No reply, no resolve. The threads stay open on the PR.
  4. Type something.

  5. Chat about this
Enter to select · Tab/Arrow keys to navigate · Esc to cancel
`;

test("parses the single-angle Claude question cursor shown in the terminal", () => {
  const question = parsePanePrompt(screenshotPrompt);

  assert.ok(question);
  assert.equal(
    question.question,
    "jupbot re-posted its 3 P2 parser findings verbatim (new threads) after you'd already dispositioned and resolved the originals as cross-platform follow-ups. How should I handle the duplicates?",
  );
  assert.equal(question.options[0]?.label, "Reply + resolve, keep disposition (Recommended) Post a short reply on each new thread pointing at the original disposition and resolve them. No code change.");
  assert.equal(question.options[0]?.selected, true);
  assert.equal(question.options[4]?.label, "Chat about this");
  assert.equal(highlightedIndex(screenshotPrompt), 0);
});

test("does not treat an ordinary numbered list as a live prompt", () => {
  const terminalOutput = `
How this works:
1. Read the transcript
2. Render its entries
3. Poll for updates
`;

  assert.equal(parsePanePrompt(terminalOutput), undefined);
  assert.equal(highlightedIndex(terminalOutput), undefined);
});
