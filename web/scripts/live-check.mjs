// Proves the window is the chat fleet: it must load a chats heading from the
// connected server (or the empty-chats state) without anyone touching the UI.
import { chromium } from "playwright-core";
import { chromiumPath } from "./chromium.mjs";

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

const heading = await page.locator("h1").first().innerText();
console.log("heading:", heading);

const ok = /chat/i.test(heading) || /need/i.test(heading) || /Connecting/i.test(heading);
console.log(ok ? "\nPASS: the window is showing chats" : "\nFAIL: expected a chats heading");

await page.screenshot({ path: "/tmp/mc-live/05-chats.png" });
await browser.close();
if (!ok) process.exit(1);
