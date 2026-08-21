import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { getKv, setKv } from "./db.js";
import { knowsModel, providerId, providerModel, type ProviderId } from "./providers.js";

export { configDir } from "./paths.js";

export interface Config {
  port: number;
  token: string;
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
  /// The model a new thread starts with, in `defaultProvider`'s own naming.
  /// Empty leaves the choice to whatever that tool is configured with.
  defaultModel: string;
  /// What a new thread — and a new agent — thinks with unless it says
  /// otherwise. The pair is validated together: a provider only ever holds one
  /// of its own models.
  defaultProvider: ProviderId;
  /// The face on your messages: empty for the default, `preset:<id>` for one
  /// of the built-in ones, or a `data:` URL for a picture you chose.
  avatar: string;
  /// What Remy puts in front of a branch it creates for a worktree. Seeded
  /// from the GitHub login at boot, so a branch someone else sees says who
  /// made it.
  worktreeBranchPrefix: string;
  /// Whoever this machine is signed in as on GitHub, read from `gh` at boot.
  /// An agent's commit address is built from it, so a commit says both which
  /// agent wrote it and whose account stood behind the machine that ran it.
  githubLogin: string;
  /// How often Remy refreshes the repositories it knows about. `off` never
  /// does, which is the setting for anyone who wants git touched only by them.
  repoUpdate: RepoUpdateEvery;
  /// What a new agent's commits are signed with by default. `off` inherits
  /// this machine's git identity, `author` credits the agent while leaving you
  /// as the committer, and `full` makes it both. Attribution only — a git
  /// identity says who wrote a commit, never proves it.
  defaultGitIdentity: GitIdentity;
  /// Whether notifications raised on this machine are shown on this machine.
  /// Off routes them only to the paired devices that asked for them, which is
  /// the setting for a machine that runs the work while you watch from another.
  notifySelf: boolean;
  /// What Remy runs its own small jobs on — naming a thread, and whatever else
  /// comes to need a model later. Separate from `defaultModel`, which is what
  /// your threads think with: this one should stay cheap. `off` declines them
  /// altogether.
  remyProvider: ProviderId;
  remyModel: string;
}

export type PreventSleepMode = "off" | "whileBusy" | "always";
export type CheckoutMode = "main" | "worktree";
export type WorktreeBase = "remote" | "local";
export type RepoUpdateEvery = "off" | "hourly" | "sixHourly" | "daily";
export type GitIdentity = "off" | "author" | "full";

const SLEEP_MODES: PreventSleepMode[] = ["off", "whileBusy", "always"];
const CHECKOUT_MODES: CheckoutMode[] = ["main", "worktree"];
const WORKTREE_BASES: WorktreeBase[] = ["remote", "local"];
const REPO_UPDATES: RepoUpdateEvery[] = ["off", "hourly", "sixHourly", "daily"];
const GIT_IDENTITIES: GitIdentity[] = ["off", "author", "full"];

/// How long between refreshes, or nothing when they are off.
export function repoUpdateInterval(every: RepoUpdateEvery): number | undefined {
  if (every === "hourly") return 60 * 60_000;
  if (every === "sixHourly") return 6 * 60 * 60_000;
  if (every === "daily") return 24 * 60 * 60_000;
  return undefined;
}
/// Which models each provider will answer to lives in `providers.ts`, so a
/// picker and this file cannot disagree about what is storable.
///
/// Remy's own jobs can also be declined outright, which a thread's model cannot.
const OFF = "off";

function preventSleepMode(value: unknown, legacyBusy?: unknown): PreventSleepMode {
  if (SLEEP_MODES.includes(value as PreventSleepMode)) return value as PreventSleepMode;
  return legacyBusy === true ? "whileBusy" : "off";
}

function oneOf<T extends string>(allowed: T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/// A model for Remy's own jobs, or `off`. Anything else falls back to that
/// provider's default rather than to a model it has never heard of.
function remyModelValue(provider: unknown, value: unknown): string {
  return value === OFF ? OFF : providerModel(provider, value);
}

/// The model a patch settles on.
///
/// A model this provider does not know keeps the one it had, like every other
/// setting here — except that "the one it had" may itself have belonged to the
/// other provider, and then it is that provider's default.
function modelFor(provider: ProviderId, asked: unknown, current: string): string {
  if (asked === undefined) return providerModel(provider, current);
  return knowsModel(provider, asked) ? String(asked) : providerModel(provider, current);
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

/// A picture small enough to live in a settings row. Anything bigger is a
/// mistake rather than an avatar, and the client resizes before sending.
const MAX_AVATAR_BYTES = 96 * 1024;

/// Either one of the built-in faces or an image someone chose. A `data:` URL is
/// the only kind of image accepted: a remote one would phone out from a window
/// that otherwise never does.
export function avatarValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^preset:[a-z0-9-]{1,32}$/.test(trimmed)) return trimmed;
  if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) return "";
  return trimmed.length > MAX_AVATAR_BYTES ? "" : trimmed;
}

/// A GitHub login, held to what GitHub itself allows. It ends up on the right
/// of an `@` in every commit an agent signs, so anything else is dropped rather
/// than passed through.
export function githubAccount(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(trimmed) ? trimmed : "";
}

/// A prefix has to survive `git check-ref-format`: no spaces, no leading or
/// trailing slash, none of the characters git reserves. Undefined when nothing
/// usable is left.
export function branchPrefix(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .trim()
    .replace(/[\s~^:?*[\\]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[/.]+|[/.]+$/g, "")
    .slice(0, 40);
  return cleaned || undefined;
}

function load(): Config {
  const parsed = getKv<Partial<Config> & { preventSleepWhileBusy?: boolean }>("config") ?? {};
  const config: Config = {
    port: Number(parsed.port) || 8420,
    token: typeof parsed.token === "string" && parsed.token.length >= 32 ? parsed.token : randomBytes(32).toString("hex"),
    contextLimit: Number(parsed.contextLimit) > 0 ? Number(parsed.contextLimit) : 200_000,
    preventSleep: preventSleepMode(parsed.preventSleep, parsed.preventSleepWhileBusy),
    defaultCheckout: oneOf(CHECKOUT_MODES, parsed.defaultCheckout, "main"),
    worktreeBase: oneOf(WORKTREE_BASES, parsed.worktreeBase, "remote"),
    worktreeRoot: worktreeRootPath(parsed.worktreeRoot),
    defaultProvider: providerId(parsed.defaultProvider),
    defaultModel: providerModel(parsed.defaultProvider, parsed.defaultModel),
    remyProvider: providerId(parsed.remyProvider),
    remyModel: remyModelValue(parsed.remyProvider, parsed.remyModel ?? "haiku"),
    repoUpdate: oneOf(REPO_UPDATES, parsed.repoUpdate, "off"),
    defaultGitIdentity: oneOf(GIT_IDENTITIES, parsed.defaultGitIdentity, "author"),
    worktreeBranchPrefix: branchPrefix(parsed.worktreeBranchPrefix) ?? "",
    githubLogin: githubAccount(parsed.githubLogin),
    avatar: avatarValue(parsed.avatar),
    // Absent means this is the only device, so it is the one to buzz.
    notifySelf: parsed.notifySelf !== false,
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
  defaultProvider: ProviderId;
  remyProvider: ProviderId;
  remyModel: string;
  repoUpdate: RepoUpdateEvery;
  worktreeBranchPrefix: string;
  avatar: string;
  defaultGitIdentity: GitIdentity;
  notifySelf: boolean;
}

export function publicSettings(): PublicSettings {
  return {
    preventSleep: config.preventSleep,
    defaultCheckout: config.defaultCheckout,
    worktreeBase: config.worktreeBase,
    worktreeRoot: config.worktreeRoot,
    defaultModel: config.defaultModel,
    defaultProvider: config.defaultProvider,
    remyProvider: config.remyProvider,
    remyModel: config.remyModel,
    repoUpdate: config.repoUpdate,
    worktreeBranchPrefix: config.worktreeBranchPrefix,
    avatar: config.avatar,
    defaultGitIdentity: config.defaultGitIdentity,
    notifySelf: config.notifySelf,
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
  // A provider and a model are one choice, so they are validated as one: a
  // patch that moves to Codex and keeps `sonnet` lands on Codex's default
  // rather than on a model Codex has never heard of.
  if (patch.defaultProvider !== undefined || patch.defaultModel !== undefined) {
    const provider = patch.defaultProvider === undefined
      ? config.defaultProvider
      : providerId(patch.defaultProvider, config.defaultProvider);
    set("defaultProvider", provider);
    set("defaultModel", modelFor(provider, patch.defaultModel, config.defaultModel));
  }
  if (patch.remyProvider !== undefined || patch.remyModel !== undefined) {
    const provider = patch.remyProvider === undefined
      ? config.remyProvider
      : providerId(patch.remyProvider, config.remyProvider);
    set("remyProvider", provider);
    set(
      "remyModel",
      patch.remyModel === OFF ? OFF : modelFor(provider, patch.remyModel, remyModelValue(provider, config.remyModel)),
    );
  }
  if (patch.repoUpdate !== undefined) {
    set("repoUpdate", oneOf(REPO_UPDATES, patch.repoUpdate, config.repoUpdate));
  }
  if (patch.defaultGitIdentity !== undefined) {
    set("defaultGitIdentity", oneOf(GIT_IDENTITIES, patch.defaultGitIdentity, config.defaultGitIdentity));
  }
  if (patch.avatar !== undefined) {
    set("avatar", avatarValue(patch.avatar));
  }
  if (patch.notifySelf !== undefined) {
    set("notifySelf", patch.notifySelf === true);
  }
  // Seeded from `gh` at boot rather than typed, but it has to be settable for
  // that seeding to persist it.
  if (patch.githubLogin !== undefined) {
    set("githubLogin", githubAccount(patch.githubLogin));
  }
  if (patch.worktreeBranchPrefix !== undefined) {
    // An unusable prefix falls back to Remy's own name rather than producing a
    // branch git will refuse to create.
    set("worktreeBranchPrefix", branchPrefix(patch.worktreeBranchPrefix) ?? "remy");
  }

  if (touched) setKv("config", config);
  return publicSettings();
}
