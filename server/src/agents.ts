import { randomUUID } from "node:crypto";
import { append, applyFields, entityIds, eventsFor } from "./board-log.js";
import type { ChatPermissionMode } from "./chat.js";
import { config } from "./config.js";
import { db, runTransaction } from "./db.js";

// An agent is a thread with a character on the front: the same Claude, the same
// worktree, the same feed, started with its instructions appended to the preset
// and its own name on the commits it makes.
//
// Note the type-only import above. `chat.ts` reads agents to build its options,
// so importing anything from it at runtime would close a cycle around a module
// that loads every chat at import time. Types are erased; the permission modes
// below are the one small duplication that buys that.

export type GitIdentityMode = "off" | "author" | "full";

export interface Agent {
  id: string;
  name: string;
  /// Lowercase, unique. What `ticket_handoff` takes and what the CLI will.
  handle: string;
  role?: string;
  instructions: string;
  provider: string;
  model?: string;
  permissionMode: ChatPermissionMode;
  avatar?: string;
  tint?: string;
  autoStart: boolean;
  /// Handles this agent may pass a ticket to. Empty means it may not hand off.
  handoffTo: string[];
  gitIdentity: GitIdentityMode;
  gitName?: string;
  /// Read-only: `agentGitEmail` derives this from the handle and the GitHub
  /// account, so nothing sets it and no client can send it.
  gitEmail?: string;
  /// The preset this was seeded from, so seeding runs once and never again.
  preset?: string;
  createdAt: number;
  updatedAt: number;
}

const PERMISSION_MODES: ChatPermissionMode[] = [
  "default",
  "auto",
  "acceptEdits",
  "plan",
  "bypassPermissions",
];
const MODELS = ["", "opus", "sonnet", "haiku"];
const GIT_IDENTITIES: GitIdentityMode[] = ["off", "author", "full"];

const EDITABLE = [
  "name",
  "handle",
  "role",
  "instructions",
  "provider",
  "model",
  "permissionMode",
  "avatar",
  "tint",
  "autoStart",
  "handoffTo",
  "gitIdentity",
  "gitName",
] as const;

/// A handle lives in a tool call and a commit trailer, so it is held to
/// something short that needs no quoting.
export function agentHandle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return cleaned || undefined;
}

/// The address on an agent's commits: its handle at whoever's machine it ran
/// on, so `git log` reads `planner@padamchopra.invalid` and says both which
/// agent wrote the commit and whose account stood behind it.
///
/// Derived rather than stored, so it follows a renamed handle and fills itself
/// in the moment `gh` can say who you are. `.invalid` is reserved by RFC 2606
/// and can never reach a mailbox or resolve, so no forge quietly maps an agent
/// onto somebody's real account — attribution, never an identity claim.
export function agentGitEmail(handle: string): string {
  return `${handle}@${config.githubLogin || "remy"}.invalid`;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

// ── projection ──────────────────────────────────────────────────────────────

function fold(id: string): Agent | undefined {
  const events = eventsFor("agent", id);
  if (events.length === 0) return undefined;
  let agent: Agent | undefined;
  for (const event of events) {
    if (event.kind === "tombstone") return undefined;
    if (event.kind === "create") {
      agent = {
        id,
        name: String(event.payload.name ?? "Agent"),
        handle: String(event.payload.handle ?? "agent"),
        instructions: String(event.payload.instructions ?? ""),
        provider: String(event.payload.provider ?? "claude"),
        permissionMode: oneOf(PERMISSION_MODES, event.payload.permissionMode, "default"),
        autoStart: event.payload.autoStart !== false,
        handoffTo: Array.isArray(event.payload.handoffTo) ? (event.payload.handoffTo as string[]) : [],
        gitIdentity: oneOf(GIT_IDENTITIES, event.payload.gitIdentity, "author"),
        // `preset` is not editable, so it is read from the create event rather
        // than folded — and without it `seedPresetAgents` would find nothing
        // and seed the built-ins again on every boot.
        ...(event.payload.preset ? { preset: String(event.payload.preset) } : {}),
        createdAt: event.at,
        updatedAt: event.at,
      };
      agent = applyFields(agent, event.payload, EDITABLE);
      continue;
    }
    if (!agent || event.kind !== "field") continue;
    agent = { ...applyFields(agent, event.payload, EDITABLE), updatedAt: event.at };
  }
  // Derived last, from the handle the fold settled on, so a renamed handle
  // takes its address with it.
  return agent && { ...agent, gitEmail: agentGitEmail(agent.handle) };
}

function write(agent: Agent): void {
  db.prepare(
    `insert into agents (
       id, name, handle, role, instructions, provider, model, permission_mode,
       avatar, tint, auto_start, handoff_to, git_identity, git_name, git_email,
       preset, created_at, updated_at, deleted
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     on conflict(id) do update set
       name = excluded.name, handle = excluded.handle, role = excluded.role,
       instructions = excluded.instructions, provider = excluded.provider,
       model = excluded.model, permission_mode = excluded.permission_mode,
       avatar = excluded.avatar, tint = excluded.tint, auto_start = excluded.auto_start,
       handoff_to = excluded.handoff_to, git_identity = excluded.git_identity,
       git_name = excluded.git_name, git_email = excluded.git_email,
       preset = excluded.preset, updated_at = excluded.updated_at, deleted = 0`,
  ).run(
    agent.id,
    agent.name,
    agent.handle,
    agent.role ?? null,
    agent.instructions,
    agent.provider,
    agent.model ?? null,
    agent.permissionMode,
    agent.avatar ?? null,
    agent.tint ?? null,
    agent.autoStart ? 1 : 0,
    JSON.stringify(agent.handoffTo),
    agent.gitIdentity,
    agent.gitName ?? null,
    agent.gitEmail ?? null,
    agent.preset ?? null,
    agent.createdAt,
    agent.updatedAt,
  );
}

/// Rebuilds one agent from its events. Called after every write, and by the
/// peer apply path once there is one.
export function reproject(id: string): Agent | undefined {
  const agent = fold(id);
  if (!agent) {
    db.prepare("update agents set deleted = 1 where id = ?").run(id);
    return undefined;
  }
  write(agent);
  return agent;
}

export function reprojectAll(): void {
  runTransaction(() => {
    for (const id of entityIds("agent")) reproject(id);
  });
}

function toAgent(row: Record<string, unknown>): Agent {
  let handoffTo: string[] = [];
  try {
    const parsed = JSON.parse(String(row.handoff_to ?? "[]")) as unknown;
    if (Array.isArray(parsed)) handoffTo = parsed.map(String);
  } catch {
    // An unreadable list means no handoffs, which fails closed.
  }
  return {
    id: String(row.id),
    name: String(row.name),
    handle: String(row.handle),
    ...(row.role ? { role: String(row.role) } : {}),
    instructions: String(row.instructions ?? ""),
    provider: String(row.provider ?? "claude"),
    ...(row.model ? { model: String(row.model) } : {}),
    permissionMode: String(row.permission_mode) as ChatPermissionMode,
    ...(row.avatar ? { avatar: String(row.avatar) } : {}),
    ...(row.tint ? { tint: String(row.tint) } : {}),
    autoStart: Number(row.auto_start) === 1,
    handoffTo,
    gitIdentity: oneOf(GIT_IDENTITIES, row.git_identity, "author"),
    ...(row.git_name ? { gitName: String(row.git_name) } : {}),
    // Derived rather than read back, so an address stored before you signed in
    // to `gh` does not outlive the fact.
    gitEmail: agentGitEmail(String(row.handle)),
    ...(row.preset ? { preset: String(row.preset) } : {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// ── reading ─────────────────────────────────────────────────────────────────

export function listAgents(): Agent[] {
  const rows = db
    .prepare("select * from agents where deleted = 0 order by created_at asc")
    .all() as Record<string, unknown>[];
  return rows.map(toAgent);
}

export function getAgent(id: string): Agent | undefined {
  const row = db.prepare("select * from agents where id = ? and deleted = 0").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? toAgent(row) : undefined;
}

export function agentByHandle(handle: string): Agent | undefined {
  const row = db.prepare("select * from agents where handle = ? and deleted = 0").get(handle) as
    | Record<string, unknown>
    | undefined;
  return row ? toAgent(row) : undefined;
}

// ── the workspace agent ─────────────────────────────────────────────────────

/// The assignee that is not an agent.
///
/// A ticket handed to the workspace is handed to the workspace's own default
/// model with no persona in front of it — what a thread you started yourself
/// would run as. It exists because most work wants doing, not characterising,
/// and writing an agent first is a step in the way.
export const WORKSPACE_AGENT = "workspace";

/// The workspace agent as an `Agent`, so anything that runs a turn takes one
/// shape. Not a row: it cannot be renamed, edited or deleted, and an empty
/// `model` is what makes it this machine's default rather than a choice.
export function workspaceAgent(): Agent {
  return {
    id: WORKSPACE_AGENT,
    name: "Workspace agent",
    handle: WORKSPACE_AGENT,
    role: "The workspace's own default model, with no instructions in front of it",
    instructions: "",
    provider: "claude",
    permissionMode: "default",
    autoStart: true,
    handoffTo: [],
    // Its commits are yours: there is no persona here to credit.
    gitIdentity: "off",
    createdAt: 0,
    updatedAt: 0,
  };
}

/// Whoever an assignee names: an agent on this machine, or the workspace agent.
/// `you` is not one of these — a ticket you keep has nobody to run it.
export function assignedAgent(id: string | undefined): Agent | undefined {
  if (!id) return undefined;
  return id === WORKSPACE_AGENT ? workspaceAgent() : getAgent(id);
}

// ── writing ─────────────────────────────────────────────────────────────────

/// Everything a caller may set, cleaned. Keys the caller left out stay out, so
/// a client that knows about one field cannot reset the others.
function validate(input: Record<string, unknown>, existing?: Agent): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = text(input.name, 40);
    if (!name) throw new Error("an agent needs a name");
    patch.name = name;
  }
  if (input.handle !== undefined || (!existing && patch.name)) {
    const asked = agentHandle(input.handle);
    const handle = asked ?? agentHandle(patch.name);
    if (!handle) throw new Error("that handle has no usable characters");
    const free = (candidate: string) => {
      // The workspace agent answers to `@workspace` everywhere an agent does,
      // so no row may take that name out from under it.
      if (candidate === WORKSPACE_AGENT) return false;
      const clash = agentByHandle(candidate);
      return !clash || clash.id === existing?.id;
    };
    // A handle you typed has to be the one you get, so a clash is an error. One
    // derived from a name is only a default, so it gets out of the way instead
    // — which is what lets "New agent" be pressed twice.
    if (asked) {
      if (asked === WORKSPACE_AGENT) throw new Error("@workspace is the workspace agent — pick another handle");
      if (!free(handle)) throw new Error(`another agent already uses @${handle}`);
      patch.handle = handle;
    } else {
      let candidate = handle;
      for (let n = 2; !free(candidate) && n < 100; n += 1) candidate = `${handle}-${n}`;
      patch.handle = candidate;
    }
  }
  if (input.role !== undefined) patch.role = text(input.role, 80) ?? "";
  if (input.instructions !== undefined) patch.instructions = text(input.instructions, 8000) ?? "";
  if (input.provider !== undefined) patch.provider = input.provider === "codex" ? "codex" : "claude";
  if (input.model !== undefined) patch.model = oneOf(MODELS, input.model, "");
  if (input.permissionMode !== undefined) {
    patch.permissionMode = oneOf(PERMISSION_MODES, input.permissionMode, existing?.permissionMode ?? "default");
  }
  if (input.avatar !== undefined) patch.avatar = text(input.avatar, 200) ?? "";
  if (input.tint !== undefined) patch.tint = text(input.tint, 24) ?? "";
  if (input.autoStart !== undefined) patch.autoStart = input.autoStart !== false;
  if (input.handoffTo !== undefined) {
    const list = Array.isArray(input.handoffTo) ? input.handoffTo : [];
    patch.handoffTo = [...new Set(list.map(agentHandle).filter((h): h is string => Boolean(h)))];
  }
  if (input.gitIdentity !== undefined) {
    patch.gitIdentity = oneOf(GIT_IDENTITIES, input.gitIdentity, existing?.gitIdentity ?? "author");
  }
  if (input.gitName !== undefined) patch.gitName = text(input.gitName, 60) ?? "";
  // `gitEmail` is deliberately not settable: it is derived from the handle and
  // the GitHub account, so there is nothing here for a client to disagree with.
  return patch;
}

export function createAgent(input: Record<string, unknown>): Agent {
  const patch = validate(input);
  if (!patch.name) throw new Error("an agent needs a name");
  const id = randomUUID();
  const handle = String(patch.handle);
  const created = {
    instructions: "",
    // What a new agent starts on comes from settings, so the API and the pane
    // agree on the answer rather than each carrying its own literal.
    provider: config.defaultProvider,
    permissionMode: "default",
    autoStart: true,
    handoffTo: [],
    gitIdentity: config.defaultGitIdentity,
    gitName: patch.name,
    ...patch,
    ...(input.preset ? { preset: String(input.preset) } : {}),
  };
  append("agent", id, "create", created);
  const agent = reproject(id);
  if (!agent) throw new Error("could not create that agent");
  return agent;
}

export function updateAgent(id: string, input: Record<string, unknown>): Agent {
  const existing = getAgent(id);
  if (!existing) throw new Error("no such agent");
  const patch = validate(input, existing);
  if (Object.keys(patch).length === 0) return existing;
  append("agent", id, "field", patch);
  const agent = reproject(id);
  if (!agent) throw new Error("no such agent");
  return agent;
}

export function deleteAgent(id: string): void {
  if (!getAgent(id)) throw new Error("no such agent");
  append("agent", id, "tombstone", {});
  reproject(id);
}

// ── git identity ────────────────────────────────────────────────────────────

/// The environment that makes an agent's commits its own.
///
/// Git reads these ahead of any config file, so nothing is written to
/// `~/.gitconfig` or to the repository and there is nothing to undo afterwards.
/// It is per thread rather than per checkout, so two agents committing in one
/// worktree stay distinct. `author` leaves the human as committer, which keeps
/// a person on every commit while still crediting the agent that wrote it.
///
/// This is attribution, not authentication: it records which agent wrote a
/// commit and proves nothing about who ran it.
export function gitIdentityEnv(agent: Agent | undefined): NodeJS.ProcessEnv {
  if (!agent || agent.gitIdentity === "off") return {};
  const name = agent.gitName?.trim() || agent.name;
  const email = agentGitEmail(agent.handle);
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    ...(agent.gitIdentity === "full"
      ? { GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email }
      : {}),
  };
}

// ── presets ─────────────────────────────────────────────────────────────────

interface Preset {
  preset: string;
  name: string;
  handle: string;
  role: string;
  tint: string;
  model: string;
  permissionMode: ChatPermissionMode;
  gitIdentity: GitIdentityMode;
  handoffTo: string[];
  instructions: string;
}

const PRESETS: Preset[] = [
  {
    preset: "scout",
    name: "Scout",
    handle: "scout",
    role: "Scopes a ticket before anyone writes code",
    tint: "violet",
    model: "",
    permissionMode: "plan",
    gitIdentity: "off",
    handoffTo: ["builder"],
    instructions: [
      "You scope work. You do not write code, and you do not need permission to say a ticket is not ready.",
      "",
      "Read enough of the repository to be specific. Then leave one comment on the ticket covering: what changes, which files, what the acceptance criteria are, and what you deliberately left out.",
      "",
      "Name the risk you would want to know about if you were the one building it. If the ticket is too big, split it rather than scoping it vaguely.",
    ].join("\n"),
  },
  {
    preset: "builder",
    name: "Builder",
    handle: "builder",
    role: "Implements the ticket in its own worktree",
    tint: "blue",
    model: "",
    permissionMode: "acceptEdits",
    gitIdentity: "author",
    handoffTo: ["critic"],
    instructions: [
      "You implement tickets. Read the ticket and every comment on it before you touch a file — the scope was decided before you arrived.",
      "",
      "Follow the conventions already in the repository rather than your own. Match the surrounding code.",
      "",
      "Commit as you go, in small commits with a sentence in the imperative for a subject. Run whatever checks the project has before you say you are finished, and say what you ran.",
      "",
      "If the ticket turns out to be wrong, stop and say so on the ticket. Do not quietly build something else.",
    ].join("\n"),
  },
  {
    preset: "critic",
    name: "Critic",
    handle: "critic",
    role: "Reads the diff and runs the checks",
    tint: "amber",
    model: "",
    permissionMode: "default",
    gitIdentity: "author",
    handoffTo: ["builder"],
    instructions: [
      "You review work that is already written. Read the diff against the base branch, then run the project's own checks.",
      "",
      "Report only what you can point at: a file, a line, and what breaks. A finding you cannot reproduce is not a finding.",
      "",
      "Hand back to the builder if something is genuinely wrong. Otherwise say what you checked and what you did not.",
    ].join("\n"),
  },
  {
    preset: "triager",
    name: "Triager",
    handle: "triager",
    role: "Keeps the backlog honest",
    tint: "teal",
    model: "haiku",
    permissionMode: "plan",
    gitIdentity: "off",
    handoffTo: [],
    instructions: [
      "You keep the backlog readable. Merge duplicates, give vague tickets a title that names the subject rather than the instruction, and set a priority you can defend in one sentence.",
      "",
      "You do not close tickets and you do not write code. When a ticket cannot be understood, say what is missing.",
    ].join("\n"),
  },
];

/// Seeds the built-in agents once. They are ordinary rows afterwards — editable
/// and deletable — and `preset` exists only so this never runs twice.
export function seedPresetAgents(): void {
  const seen = new Set(
    (db.prepare("select preset from agents where preset is not null").all() as { preset: string }[]).map(
      (row) => row.preset,
    ),
  );
  for (const preset of PRESETS) {
    if (seen.has(preset.preset)) continue;
    try {
      createAgent({ ...preset, gitName: preset.name });
    } catch (error) {
      console.error(`could not seed the ${preset.name} agent:`, error);
    }
  }
}
