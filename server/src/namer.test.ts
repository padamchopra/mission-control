import assert from "node:assert/strict";
import test from "node:test";

import { cleanTitle } from "./namer.js";

test("takes the title a model actually wrote", () => {
  assert.equal(cleanTitle("Flaky login test"), "Flaky login test");
  assert.equal(cleanTitle("  Flaky login test\n"), "Flaky login test");
});

test("strips the wrapping models like to add", () => {
  assert.equal(cleanTitle('"Flaky login test"'), "Flaky login test");
  assert.equal(cleanTitle("'Flaky login test'"), "Flaky login test");
  assert.equal(cleanTitle("“Flaky login test”"), "Flaky login test");
  assert.equal(cleanTitle("Flaky login test."), "Flaky login test");
  assert.equal(cleanTitle("`Flaky login test`"), "Flaky login test");
});

test("keeps a question mark, which can be the whole point of a title", () => {
  assert.equal(cleanTitle("Why is login flaky?"), "Why is login flaky?");
});

test("takes the first line when a model adds more", () => {
  assert.equal(cleanTitle("Flaky login test\n\nThis names the session about…"), "Flaky login test");
});

test("declines an answer that is prose rather than a title", () => {
  const essay = "Sure! Here is a title for your session. ".repeat(6);
  assert.equal(cleanTitle(essay), undefined);
});

test("declines an empty or punctuation-only answer", () => {
  assert.equal(cleanTitle(""), undefined);
  assert.equal(cleanTitle("   \n  "), undefined);
  assert.equal(cleanTitle('"."'), undefined);
});

test("bounds a title that is long but still a title", () => {
  const long = "Refactor the authentication middleware and its supporting helper modules";
  const title = cleanTitle(long);
  assert.ok(title && title.length <= 60, `expected a bounded title, got ${title?.length}`);
});
