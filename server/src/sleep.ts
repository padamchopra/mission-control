import { spawn, type ChildProcess } from "node:child_process";
import { config } from "./config.js";

/// macOS idle-sleep assertion via `caffeinate -i`.
///
/// `whileBusy` holds it while a chat is working or waiting on you.
/// `always` holds it until you pick another option or this process dies
/// (the machine turning off). Closing the lid can still sleep the Mac.

let busy: () => boolean = () => false;
let child: ChildProcess | undefined;

export function setSleepBusyCheck(fn: () => boolean): void {
  busy = fn;
}

export function sleepSupported(): boolean {
  return process.platform === "darwin";
}

export function syncSleepAssertion(): void {
  if (shouldHold()) acquire();
  else release();
}

function shouldHold(): boolean {
  if (!sleepSupported()) return false;
  if (config.preventSleep === "always") return true;
  return config.preventSleep === "whileBusy" && busy();
}

function acquire(): void {
  if (child && child.exitCode === null && !child.killed) return;
  const next = spawn("caffeinate", ["-i"], { stdio: "ignore" });
  child = next;
  next.on("error", () => {
    if (child === next) child = undefined;
  });
  next.on("exit", () => {
    if (child !== next) return;
    child = undefined;
    if (shouldHold()) acquire();
  });
}

function release(): void {
  if (!child) return;
  const current = child;
  child = undefined;
  current.kill("SIGTERM");
}
