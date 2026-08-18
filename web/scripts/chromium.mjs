import { readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/// Finds Playwright's cached Chromium.
///
/// Resolved rather than hardcoded: the cache directory carries a build number
/// (`chromium-1234`) that changes with every Playwright bump, and a pinned path
/// would break silently the next time anything upgrades it.
export function chromiumPath() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(cache)) {
    throw new Error(`no Playwright cache at ${cache} — run: npx playwright install chromium`);
  }
  const builds = readdirSync(cache)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));

  for (const build of builds) {
    for (const app of ["Google Chrome for Testing.app", "Chromium.app"]) {
      const binary = join(
        cache,
        build,
        "chrome-mac-arm64",
        app,
        "Contents/MacOS",
        app.replace(".app", ""),
      );
      if (existsSync(binary)) return binary;
    }
  }
  throw new Error(`no Chromium binary under ${cache} — run: npx playwright install chromium`);
}
