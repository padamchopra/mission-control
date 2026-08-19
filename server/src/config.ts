import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
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
  /// Where a chat opens when its workspace has worktrees: the primary checkout,
  /// or a worktree of the branch you picked.
  defaultCheckout: CheckoutMode;
  /// What a new worktree branches from — the remote's copy of the default
  /// branch, or whatever the primary checkout is on right now.
  worktreeBase: WorktreeBase;
  /// Directory that holds Remy's `.remy` worktree folder. Empty means each
  /// workspace holds its own, at `<workspace>/.remy`.
  worktreeRoot: string;
  /// The model a new chat starts with. Empty is Claude Code's own default.
  defaultModel: string;
  /// The model Remy runs its own small jobs on — naming a chat, and whatever
  /// else comes to need a model later. Separate from `defaultModel`, which is
  /// what your chats think with: this one should stay cheap.
  remyModel: string;
}

export type PreventSleepMode = "off" | "whileBusy" | "always";
export type CheckoutMode = "main" | "worktree";
export type WorktreeBase = "remote" | "local";

const SLEEP_MODES: PreventSleepMode[] = ["off", "whileBusy", "always"];
const CHECKOUT_MODES: CheckoutMode[] = ["main", "worktree"];
const WORKTREE_BASES: WorktreeBase[] = ["remote", "local"];
/// Only the aliases Claude Code accepts on the command line. A free-string
/// model would fail at spawn time, long after the picker said it was fine.
const MODELS = ["", "opus", "sonnet", "haiku"];

function preventSleepMode(value: unknown, legacyBusy?: unknown): PreventSleepMode {
  if (SLEEP_MODES.includes(value as PreventSleepMode)) return value as PreventSleepMode;
  return legacyBusy === true ? "whileBusy" : "off";
}

function oneOf<T extends string>(allowed: T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/// A worktree root has to be somewhere `git worktree add` can actually write,
/// so it is an absolute path or nothing. `~` is expanded here because the
/// clients that set it are showing people a home-relative path.
export function worktreeRootPath(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const expanded = trimmed === "~" || trimmed.startsWith("~/")
    ? join(homedir(), trimmed.slice(1))
    : trimmed;
  return isAbsolute(expanded) ? expanded.replace(/\/+$/, "") : "";
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
    defaultCheckout: oneOf(CHECKOUT_MODES, parsed.defaultCheckout, "main"),
    worktreeBase: oneOf(WORKTREE_BASES, parsed.worktreeBase, "remote"),
    worktreeRoot: worktreeRootPath(parsed.worktreeRoot),
    defaultModel: oneOf(MODELS, parsed.defaultModel, ""),
    remyModel: oneOf(MODELS, parsed.remyModel, "haiku"),
  };
  setKv("config", config);
  return config;
}

export const config = load();

export interface PublicSettings {
  preventSleep: PreventSleepMode;
  defaultCheckout: CheckoutMode;
  worktreeBase: WorktreeBase;
  worktreeRoot: string;
  defaultModel: string;
  remyModel: string;
}

export function publicSettings(): PublicSettings {
  return {
    preventSleep: config.preventSleep,
    defaultCheckout: config.defaultCheckout,
    worktreeBase: config.worktreeBase,
    worktreeRoot: config.worktreeRoot,
    defaultModel: config.defaultModel,
    remyModel: config.remyModel,
  };
}

/// Applies only the keys the caller actually sent, so a client that knows about
/// one setting cannot reset the rest to their defaults.
export function patchSettings(patch: Record<string, unknown>): PublicSettings {
  let touched = false;
  const set = <K extends keyof Config>(key: K, value: Config[K]) => {
    config[key] = value;
    touched = true;
  };

  if (patch.preventSleep !== undefined || patch.preventSleepWhileBusy !== undefined) {
    set("preventSleep", preventSleepMode(patch.preventSleep, patch.preventSleepWhileBusy));
  }
  if (patch.defaultCheckout !== undefined) {
    set("defaultCheckout", oneOf(CHECKOUT_MODES, patch.defaultCheckout, config.defaultCheckout));
  }
  if (patch.worktreeBase !== undefined) {
    set("worktreeBase", oneOf(WORKTREE_BASES, patch.worktreeBase, config.worktreeBase));
  }
  if (patch.worktreeRoot !== undefined) {
    set("worktreeRoot", worktreeRootPath(patch.worktreeRoot));
  }
  if (patch.defaultModel !== undefined) {
    set("defaultModel", oneOf(MODELS, patch.defaultModel, config.defaultModel));
  }
  if (patch.remyModel !== undefined) {
    set("remyModel", oneOf(MODELS, patch.remyModel, config.remyModel));
  }

  if (touched) setKv("config", config);
  return publicSettings();
}
