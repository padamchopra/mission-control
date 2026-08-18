// Proves the fleet view actually tracks the server: create a tmux session on
// this machine and the window must show it without anyone touching the app.
import { chromium } from "playwright-core";
import { chromiumPath } from "./chromium.mjs";
import { execSync } from "node:child_process";


const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

const heading = () => page.locator("h1").first().innerText();
const before = await heading();
console.log("before:", before);

// A tmux session started from a shell is exactly the case the push channel
// misses — the server only broadcasts `sessions` when it made the change
// itself — so this is really a test of the poll fallback underneath it.
// Nothing in the page is touched directly.
execSync("tmux new-session -d -s live-push-check -c /tmp");
await page.waitForFunction(
  (prev) => document.querySelector("h1")?.textContent !== prev,
  before,
  { timeout: 25000 },
).catch(() => {});
const after = await heading();
console.log("after: ", after);
execSync("tmux kill-session -t live-push-check");

await page.screenshot({ path: "/tmp/mc-live/05-after-push.png" });
console.log(
  before !== after
    ? "\nPASS: the window tracked the server with no user action"
    : "\nFAIL: the window did not pick up the new session",
);
await browser.close();
