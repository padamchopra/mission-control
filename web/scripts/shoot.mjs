// Screenshot harness for the web window.
//
// The UI is a web app (Electron in production, Vite in preview). This script
// renders states and interactions to PNGs that can be looked at directly.
//
// Uses Playwright's already-cached Chromium; nothing is downloaded.
import { chromium } from "playwright-core";
import { chromiumPath } from "./chromium.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";


const URL = process.env.MC_URL ?? "http://127.0.0.1:5173";
const OUT = process.env.MC_OUT ?? "/tmp/mc-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "networkidle" });

const shoot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  ${name}.png`);
};

console.log("captured:");
await shoot("01-main");

// The ⌘K palette.
await page.keyboard.press("Meta+k");
await page.waitForTimeout(350);
await shoot("02-palette");
await page.keyboard.type("sql");
await page.waitForTimeout(250);
await shoot("03-palette-filtered");
await page.keyboard.press("Escape");
await page.waitForTimeout(250);

// The device popover — the interaction that was broken in SwiftUI, where the
// menu was laid out in flow and pushed the whole sidebar down.
await page.getByText("All devices").first().click();
await page.waitForTimeout(300);
await shoot("04-device-popover");

// Prove it floats: the nav below must not have moved.
const navBox = await page.getByText("Chats").last().boundingBox();
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const navBoxAfter = await page.getByText("Chats").last().boundingBox();
const shifted = Math.abs((navBox?.y ?? 0) - (navBoxAfter?.y ?? 0));
console.log(`\npopover reflow check: nav moved ${shifted.toFixed(1)}px (must be 0)`);

if (errors.length) {
  console.log(`\nconsole errors (${errors.length}):`);
  for (const e of errors.slice(0, 8)) console.log("  " + e);
} else {
  console.log("no console errors");
}

await browser.close();
