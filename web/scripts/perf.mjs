// What the window costs to open, pane by pane.
//
// Read-only on purpose: it opens each pane against the real daemon and counts
// what that took, so it can be run on anybody's machine without touching their
// board. The number that matters is not the total — it is how much of it went
// to a device that is not answering, because that is what used to hold the
// panes on this machine off the screen.
import { chromium } from "playwright-core";
import { chromiumPath } from "./chromium.mjs";

const TARGET = process.env.MC_URL ?? "http://127.0.0.1:5173";
const RUNS = Number(process.env.MC_RUNS ?? 3);

// Each pane, and what says it has painted rather than merely mounted.
const PANES = [
  // The sidebar says nothing about threads until the first read answers, so
  // either a row or the empty state means the list has actually filled in.
  { name: "Threads", hash: "", ready: () => document.querySelectorAll('[data-sidebar="menu-button"].flex-col').length > 0
      || document.body.innerText.includes("No threads yet.") },
  { name: "Board", hash: "#/board", ready: () => /Backlog/.test(document.body.innerText) },
  { name: "Recurring", hash: "#/recurring", ready: () => /Recurring/.test(document.body.innerText) },
  { name: "Agents", hash: "#/settings/agents", ready: () => /@/.test(document.body.innerText) },
  { name: "Devices", hash: "#/settings/devices", ready: () => /This machine/.test(document.body.innerText) },
];

const browser = await chromium.launch({ executablePath: chromiumPath() });
const runs = new Map(PANES.map((pane) => [pane.name, []]));

for (let run = 0; run < RUNS; run += 1) {
  for (const pane of PANES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const asked = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) asked.push(new URL(request.url()).pathname.replace("/api", ""));
    });
    const started = Date.now();
    await page.goto(`${TARGET}${pane.hash}`, { waitUntil: "domcontentloaded" });
    const painted = await page
      .waitForFunction(pane.ready, null, { timeout: 45_000, polling: 20 })
      .then(() => Date.now() - started, () => -1);
    runs.get(pane.name).push({
      painted,
      asked: asked.length,
      // A paired machine is reached through this one, so its requests are the
      // ones with a device in the path.
      elsewhere: asked.filter((path) => /^\/peers\/[^/]+\/api\//.test(path)).length,
    });
    await page.close();
  }
}

let slow = false;
for (const [name, results] of runs) {
  const times = results.map((r) => r.painted).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const never = times.filter((t) => t < 0).length;
  const worst = times[times.length - 1];
  const { asked, elsewhere } = results[0];
  console.log(
    `${name.padEnd(10)} ${String(median).padStart(6)}ms median, ${String(worst).padStart(6)}ms worst`
    + `  ${asked} requests, ${elsewhere} to another device`
    + (never ? `  ${never} NEVER PAINTED` : ""),
  );
  // A pane on this machine reads from this machine. Anything above a second
  // means it is waiting on something it should not be.
  if (never || worst > 1000) slow = true;
}

console.log(slow ? "SLOW: a pane took over a second to paint" : "OK");
await browser.close();
process.exit(slow ? 1 : 0);
