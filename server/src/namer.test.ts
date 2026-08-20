import assert from "node:assert/strict";
import test from "node:test";

import { cleanBranch, cleanTitle } from "./namer.js";

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

test("turns a name into a short branch slug", () => {
  assert.equal(cleanBranch("Session cookie expiry"), "session-cookie-expiry");
  assert.equal(cleanBranch("Dark mode"), "dark-mode");
  assert.equal(cleanBranch("  Flaky   Login  Test  "), "flaky-login-test");
});

test("holds a branch to a handful of short words", () => {
  // A model that ignores "two to four words" does not get to name a path.
  const slug = cleanBranch("refactor the authentication middleware and its supporting helper modules");
  assert.ok(slug && slug.length <= 32, `too long: ${slug}`);
  assert.ok(slug && slug.split("-").length <= 4, `too many words: ${slug}`);
  // It cuts on a word rather than mid-word.
  assert.ok(slug && !slug.endsWith("-"), slug);
});

test("keeps a branch to what git will accept", () => {
  assert.equal(cleanBranch("Fix: login/logout (flaky!)"), "fix-login-logout-flaky");
  assert.equal(cleanBranch("café déjà vu"), "cafe-deja-vu");
  assert.equal(cleanBranch("...---..."), undefined);
  assert.equal(cleanBranch(""), undefined);
});

test("never leaves a slug that is only a separator", () => {
  for (const raw of ["-", "--", " - - ", "!!!"]) {
    const slug = cleanBranch(raw);
    assert.ok(slug === undefined || /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug), `${raw} -> ${slug}`);
  }
});
