import { randomBytes } from "node:crypto";
import { getKv, setKv } from "./db.js";

export { configDir } from "./paths.js";

export interface Config {
  port: number;
  token: string;
  // Notifications go through ntfy (https://ntfy.sh or a self-hosted server).
  // The topic is a random, unguessable string — subscribe the ntfy app to it.
  ntfyServer: string;
  ntfyTopic: string;
  // The context window the sessions on this host run with, for the context
  // meter. Transcripts record the model but not its window size, and the 1M
  // variants share a model id with the 200k ones — so a session running with a
  // larger window has to be declared here. Sessions self-correct upward once
  // they exceed this (or once one auto-compacts, which pins the real ceiling).
  contextLimit: number;
  /// How this machine holds an idle-sleep assertion (`caffeinate -i`).
  /// `always` lasts until you pick another option or the process dies.
  preventSleep: PreventSleepMode;
}

export type PreventSleepMode = "off" | "whileBusy" | "always";

const SLEEP_MODES: PreventSleepMode[] = ["off", "whileBusy", "always"];

function preventSleepMode(value: unknown, legacyBusy?: unknown): PreventSleepMode {
  if (SLEEP_MODES.includes(value as PreventSleepMode)) return value as PreventSleepMode;
  return legacyBusy === true ? "whileBusy" : "off";
}

function load(): Config {
  const parsed = getKv<Partial<Config> & { preventSleepWhileBusy?: boolean }>("config") ?? {};
  const config: Config = {
    port: Number(parsed.port) || 8420,
    token: typeof parsed.token === "string" && parsed.token.length >= 32 ? parsed.token : randomBytes(32).toString("hex"),
    ntfyServer: typeof parsed.ntfyServer === "string" && parsed.ntfyServer ? parsed.ntfyServer : "https://ntfy.sh",
    ntfyTopic: typeof parsed.ntfyTopic === "string" && parsed.ntfyTopic ? parsed.ntfyTopic : `mc-${randomBytes(9).toString("hex")}`,
    contextLimit: Number(parsed.contextLimit) > 0 ? Number(parsed.contextLimit) : 200_000,
    preventSleep: preventSleepMode(parsed.preventSleep, parsed.preventSleepWhileBusy),
  };
  setKv("config", config);
  return config;
}

export const config = load();

export function publicSettings(): { preventSleep: PreventSleepMode } {
  return { preventSleep: config.preventSleep };
}

export function patchSettings(patch: { preventSleep?: unknown; preventSleepWhileBusy?: unknown }): {
  preventSleep: PreventSleepMode;
} {
  if (patch.preventSleep !== undefined || patch.preventSleepWhileBusy !== undefined) {
    config.preventSleep = preventSleepMode(patch.preventSleep, patch.preventSleepWhileBusy);
    setKv("config", config);
  }
  return publicSettings();
}
