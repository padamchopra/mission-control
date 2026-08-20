import { randomUUID } from "node:crypto";
import { append, applyFields, deviceId, entityIds, eventsFor, type LogEvent } from "./board-log.js";
import { getAgent, listAgents } from "./agents.js";
import { db, runTransaction } from "./db.js";
import { getProject, nextTicketNumber, ticketKey, whenSlugChanges } from "./projects.js";

/// Tickets, their activity, and the threads that have worked on them.
///
/// Nothing here writes a ticket row directly. Every change is an event on the
/// log and the row is the fold of it — which is what makes the activity feed
/// and the sync history the same thing rather than two records that can
/// disagree.

export type TicketStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "needs_input"
  | "pr_review"
  | "done"
  | "cancelled";

export const TICKET_STATUSES: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "needs_input",
  "pr_review",
  "done",
  "cancelled",
];

/// The two Remy is allowed to set by watching a thread. Everything else is
/// yours, or something an agent had to declare on purpose — so a card you drag
/// to Done is not dragged back by the next turn that happens to end.
const DERIVED: TicketStatus[] = ["in_progress", "needs_input"];

export interface Ticket {
  id: string;
  /// The ticket's own number. `key` is this behind the project's slug, and is
  /// recomputed rather than stored — so renaming a slug re-keys every ticket.
  number: number;
  key: string;
  projectId: string;
  title: string;
  body: string;
  status: TicketStatus;
  priority: number;
  assigneeAgentId?: string;
  parentId?: string;
  rank: string;
  /// The machine that runs this ticket's work. Decided when the ticket is made
  /// and changed by hand; no machine ever claims a ticket that is not its own.
  deviceId?: string;
  branch?: string;
  handoffs: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  closedAt?: number;
}

export interface TicketThread {
  ticketId: string;
  deviceId: string;
  chatId: string;
  agentId?: string;
  stage?: string;
  /// `runner` when the board started it, `you` when it was attached by hand.
  /// The runner uses this to know a ticket is already being worked on.
  linkedBy: "runner" | "you";
  createdAt: number;
}

export interface TicketActivity {
  id: string;
  at: number;
  /// `you`, `remy`, or an agent's handle.
  actor: string;
  kind: string;
  body?: string;
  detail?: Record<string, unknown>;
}

export interface TicketView extends Ticket {
  threads: TicketThread[];
}

const EDITABLE = [
  "title",
  "body",
  "status",
  "priority",
  "assigneeAgentId",
  "parentId",
  "rank",
  "deviceId",
  "branch",
  "handoffs",
  "startedAt",
  "closedAt",
] as const;

// ── ordering ────────────────────────────────────────────────────────────────

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/// A key that sorts between two others, so moving one card writes one row
/// rather than renumbering the column. `a` is the floor and is never minted,
/// which is what leaves room to insert before the first card.
export function rankBetween(before?: string, after?: string): string {
  const lo = before ?? "";
  let hi = after ?? "";
  let prefix = "";
  for (let i = 0; i < 64; i += 1) {
    const ca = i < lo.length ? Math.max(ALPHABET.indexOf(lo[i]), 0) : 0;
    const cb = i < hi.length ? Math.max(ALPHABET.indexOf(hi[i]), 0) : ALPHABET.length;
    if (ca === cb) {
      prefix += ALPHABET[ca];
      continue;
    }
    if (cb - ca > 1) return prefix + ALPHABET[Math.floor((ca + cb) / 2)];
    // Adjacent letters leave no room here, so keep the lower one and descend a
    // level — past this point the upper bound cannot constrain us any further.
    prefix += ALPHABET[ca];
    hi = "";
  }
  return `${prefix}n`;
}

// ── projection ──────────────────────────────────────────────────────────────

function status(value: unknown, fallback: TicketStatus = "backlog"): TicketStatus {
  return TICKET_STATUSES.includes(value as TicketStatus) ? (value as TicketStatus) : fallback;
}

function foldTicket(id: string, events: LogEvent[]): Ticket | undefined {
  let ticket: Ticket | undefined;
  for (const event of events) {
    if (event.kind === "tombstone") return undefined;
    if (event.kind === "create") {
      ticket = {
        id,
        number: Number(event.payload.number ?? 0),
        key: "",
        projectId: String(event.payload.projectId ?? ""),
        title: String(event.payload.title ?? "Untitled"),
        body: String(event.payload.body ?? ""),
        status: status(event.payload.status),
        priority: Number(event.payload.priority ?? 0),
        rank: String(event.payload.rank ?? "n"),
        handoffs: 0,
        createdAt: event.at,
        updatedAt: event.at,
      };
      ticket = applyFields(ticket, event.payload, EDITABLE);
      ticket.status = status(ticket.status);
      continue;
    }
    if (!ticket) continue;
    if (event.kind === "field" || event.kind === "status") {
      ticket = { ...applyFields(ticket, event.payload, EDITABLE), updatedAt: event.at };
      ticket.status = status(ticket.status, "backlog");
      if (event.kind === "status") {
        if (ticket.status === "in_progress" && !ticket.startedAt) ticket.startedAt = event.at;
        const closed = ticket.status === "done" || ticket.status === "cancelled";
        if (closed) ticket.closedAt = event.at;
        else delete ticket.closedAt;
      }
      continue;
    }
    if (event.kind === "handoff") {
      ticket = {
        ...ticket,
        handoffs: ticket.handoffs + 1,
        assigneeAgentId: String(event.payload.toAgentId ?? ticket.assigneeAgentId ?? ""),
        updatedAt: event.at,
      };
    }
  }
  return ticket;
}

function foldThreads(events: LogEvent[]): TicketThread[] {
  const threads = new Map<string, TicketThread>();
  for (const event of events) {
    const key = `${event.payload.deviceId ?? event.deviceId}:${event.payload.chatId}`;
    if (event.kind === "link") {
      threads.set(key, {
        ticketId: event.entityId,
        deviceId: String(event.payload.deviceId ?? event.deviceId),
        chatId: String(event.payload.chatId ?? ""),
        ...(event.payload.agentId ? { agentId: String(event.payload.agentId) } : {}),
        ...(event.payload.stage ? { stage: String(event.payload.stage) } : {}),
        linkedBy: event.payload.linkedBy === "runner" ? "runner" : "you",
        createdAt: event.at,
      });
    }
    if (event.kind === "unlink") threads.delete(key);
  }
  return [...threads.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function reproject(id: string): Ticket | undefined {
  const events = eventsFor("ticket", id);
  const folded = events.length ? foldTicket(id, events) : undefined;
  // The key is never folded: it is the number behind whatever the project's
  // slug is right now.
  const ticket = folded && { ...folded, key: ticketKey(folded.projectId, folded.number) };
  db.prepare("delete from ticket_threads where ticket_id = ?").run(id);
  if (!ticket) {
    db.prepare("update tickets set deleted = 1 where id = ?").run(id);
    return undefined;
  }
  db.prepare(
    `insert into tickets (
       id, number, key, project_id, title, body, status, priority, assignee_agent_id,
       parent_id, rank, device_id, branch, handoffs,
       created_at, updated_at, started_at, closed_at, deleted
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     on conflict(id) do update set
       number = excluded.number, key = excluded.key,
       project_id = excluded.project_id, title = excluded.title,
       body = excluded.body, status = excluded.status, priority = excluded.priority,
       assignee_agent_id = excluded.assignee_agent_id, parent_id = excluded.parent_id,
       rank = excluded.rank, device_id = excluded.device_id, branch = excluded.branch,
       handoffs = excluded.handoffs, updated_at = excluded.updated_at,
       started_at = excluded.started_at, closed_at = excluded.closed_at, deleted = 0`,
  ).run(
    ticket.id,
    ticket.number,
    ticket.key,
    ticket.projectId,
    ticket.title,
    ticket.body,
    ticket.status,
    ticket.priority,
    ticket.assigneeAgentId || null,
    ticket.parentId || null,
    ticket.rank,
    ticket.deviceId || null,
    ticket.branch || null,
    ticket.handoffs,
    ticket.createdAt,
    ticket.updatedAt,
    ticket.startedAt ?? null,
    ticket.closedAt ?? null,
  );
  const insert = db.prepare(
    `insert or replace into ticket_threads
       (ticket_id, device_id, chat_id, agent_id, stage, linked_by, created_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const thread of foldThreads(events)) {
    insert.run(
      thread.ticketId,
      thread.deviceId,
      thread.chatId,
      thread.agentId ?? null,
      thread.stage ?? null,
      thread.linkedBy,
      thread.createdAt,
    );
  }
  return ticket;
}

export function reprojectAll(): void {
  runTransaction(() => {
    for (const id of entityIds("ticket")) reproject(id);
  });
}

function toTicket(row: Record<string, unknown>): Ticket {
  return {
    id: String(row.id),
    number: Number(row.number ?? 0),
    key: String(row.key),
    projectId: String(row.project_id),
    title: String(row.title),
    body: String(row.body ?? ""),
    status: status(row.status),
    priority: Number(row.priority ?? 0),
    ...(row.assignee_agent_id ? { assigneeAgentId: String(row.assignee_agent_id) } : {}),
    ...(row.parent_id ? { parentId: String(row.parent_id) } : {}),
    rank: String(row.rank ?? "n"),
    ...(row.device_id ? { deviceId: String(row.device_id) } : {}),
    ...(row.branch ? { branch: String(row.branch) } : {}),
    handoffs: Number(row.handoffs ?? 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(row.started_at ? { startedAt: Number(row.started_at) } : {}),
    ...(row.closed_at ? { closedAt: Number(row.closed_at) } : {}),
  };
}

// ── reading ─────────────────────────────────────────────────────────────────

function threadsFor(ticketId: string): TicketThread[] {
  const rows = db
    .prepare("select * from ticket_threads where ticket_id = ? order by created_at asc")
    .all(ticketId) as Record<string, unknown>[];
  return rows.map((row) => ({
    ticketId: String(row.ticket_id),
    deviceId: String(row.device_id),
    chatId: String(row.chat_id),
    ...(row.agent_id ? { agentId: String(row.agent_id) } : {}),
    ...(row.stage ? { stage: String(row.stage) } : {}),
    linkedBy: row.linked_by === "runner" ? "runner" : "you",
    createdAt: Number(row.created_at),
  }));
}

export function listTickets(projectId?: string): TicketView[] {
  const rows = (
    projectId
      ? db.prepare("select * from tickets where deleted = 0 and project_id = ? order by rank asc").all(projectId)
      : db.prepare("select * from tickets where deleted = 0 order by rank asc").all()
  ) as Record<string, unknown>[];
  return rows.map((row) => {
    const ticket = toTicket(row);
    return { ...ticket, threads: threadsFor(ticket.id) };
  });
}

export function getTicket(id: string): TicketView | undefined {
  const row = db.prepare("select * from tickets where id = ? and deleted = 0").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return undefined;
  const ticket = toTicket(row);
  return { ...ticket, threads: threadsFor(ticket.id) };
}

export function ticketByKey(key: string): TicketView | undefined {
  const row = db.prepare("select id from tickets where key = ? and deleted = 0").get(key) as
    | { id?: string }
    | undefined;
  return row?.id ? getTicket(row.id) : undefined;
}

/// The ticket a thread belongs to, if any. A thread belongs to at most one, so
/// derived status has exactly one source.
export function ticketForChat(chatId: string): TicketView | undefined {
  const row = db
    .prepare("select ticket_id from ticket_threads where chat_id = ? and device_id = ?")
    .get(chatId, deviceId) as { ticket_id?: string } | undefined;
  return row?.ticket_id ? getTicket(row.ticket_id) : undefined;
}

const ACTIVITY_KINDS = new Set(["create", "status", "comment", "handoff", "link", "unlink", "field"]);

/// The ticket's story, newest last. This is the log itself — there is no second
/// record that could drift from it.
export function ticketActivity(id: string): TicketActivity[] {
  return eventsFor("ticket", id)
    .filter((event) => ACTIVITY_KINDS.has(event.kind))
    // A field event that only moved a card in its column is noise on a feed.
    .filter((event) => event.kind !== "field" || Object.keys(event.payload).some((key) => key !== "rank"))
    .map((event) => ({
      id: event.id,
      at: event.at,
      actor: String(event.payload.actor ?? "you"),
      kind: event.kind,
      ...(event.payload.body ? { body: String(event.payload.body) } : {}),
      detail: event.payload,
    }));
}

// ── writing ─────────────────────────────────────────────────────────────────

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function validate(input: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = text(input.title, 200);
    if (!title) throw new Error("a ticket needs a title");
    patch.title = title;
  }
  if (input.body !== undefined) patch.body = typeof input.body === "string" ? input.body.slice(0, 20000) : "";
  if (input.priority !== undefined) patch.priority = Math.min(Math.max(Number(input.priority) || 0, 0), 4);
  if (input.assigneeAgentId !== undefined) {
    const id = text(input.assigneeAgentId, 64);
    if (id && !getAgent(id)) throw new Error("no such agent");
    patch.assigneeAgentId = id ?? "";
  }
  if (input.parentId !== undefined) {
    const parent = text(input.parentId, 64);
    if (parent && !getTicket(parent)) throw new Error("no such parent ticket");
    patch.parentId = parent ?? "";
  }
  if (input.deviceId !== undefined) patch.deviceId = text(input.deviceId, 64) ?? "";
  if (input.branch !== undefined) patch.branch = text(input.branch, 200) ?? "";
  if (input.rank !== undefined) patch.rank = text(input.rank, 64) ?? "n";
  return patch;
}

export function createTicket(input: Record<string, unknown>): TicketView {
  const projectId = String(input.projectId ?? "");
  const project = getProject(projectId);
  if (!project) throw new Error("pick a project for this ticket");
  const patch = validate(input);
  if (!patch.title) throw new Error("a ticket needs a title");

  const id = randomUUID();
  const first = db
    .prepare("select rank from tickets where project_id = ? and deleted = 0 order by rank asc limit 1")
    .get(projectId) as { rank?: string } | undefined;

  append("ticket", id, "create", {
    number: nextTicketNumber(project.id),
    projectId,
    status: status(input.status, "backlog"),
    // New tickets land at the top of their column, where you are looking.
    rank: rankBetween(undefined, first?.rank),
    // A ticket runs where it was made unless somebody moves it. No machine ever
    // picks up a ticket that has not been pointed at it.
    deviceId,
    actor: "you",
    ...patch,
  });
  const ticket = getTicketOrThrow(id);
  return ticket;
}

function getTicketOrThrow(id: string): TicketView {
  reproject(id);
  const ticket = getTicket(id);
  if (!ticket) throw new Error("no such ticket");
  return ticket;
}

export function updateTicket(id: string, input: Record<string, unknown>): TicketView {
  if (!getTicket(id)) throw new Error("no such ticket");
  const patch = validate(input);
  if (patch.parentId === id) throw new Error("a ticket cannot be its own parent");
  // One level of nesting is all the board draws, and a cycle would make the
  // progress ring count forever.
  if (patch.parentId && getTicket(String(patch.parentId))?.parentId) {
    throw new Error("that ticket is already a sub-ticket");
  }
  if (Object.keys(patch).length === 0) return getTicketOrThrow(id);
  append("ticket", id, "field", { ...patch, actor: "you" });
  return getTicketOrThrow(id);
}

/// Moves a ticket, recording who moved it. `actor` is what the feed shows, and
/// what tells a derived move apart from one you made.
export function setTicketStatus(
  id: string,
  next: unknown,
  options: { actor?: string; note?: string; rank?: string } = {},
): TicketView {
  const ticket = getTicket(id);
  if (!ticket) throw new Error("no such ticket");
  const value = status(next, ticket.status);
  if (value === ticket.status && !options.rank) return ticket;
  append("ticket", id, "status", {
    status: value,
    actor: options.actor ?? "you",
    ...(options.note ? { body: options.note } : {}),
    ...(options.rank ? { rank: options.rank } : {}),
  });
  return getTicketOrThrow(id);
}

/// Reorders within a column, or across columns in one move — which is what a
/// drag is, and what the keyboard move is too.
export function moveTicket(id: string, next: unknown, before?: string, after?: string): TicketView {
  return setTicketStatus(id, next, { rank: rankBetween(before, after) });
}

export function commentOnTicket(id: string, body: string, actor = "you"): TicketView {
  if (!getTicket(id)) throw new Error("no such ticket");
  const text_ = body.trim().slice(0, 10000);
  if (!text_) throw new Error("a comment needs something in it");
  append("ticket", id, "comment", { body: text_, actor });
  return getTicketOrThrow(id);
}

export function deleteTicket(id: string): void {
  if (!getTicket(id)) throw new Error("no such ticket");
  append("ticket", id, "tombstone", { actor: "you" });
  reproject(id);
}

// ── threads ─────────────────────────────────────────────────────────────────

export function linkThread(
  ticketId: string,
  input: { chatId: string; agentId?: string; stage?: string; linkedBy?: "runner" | "you" },
): TicketView {
  if (!getTicket(ticketId)) throw new Error("no such ticket");
  const chatId = input.chatId.trim();
  if (!chatId) throw new Error("pick a thread to attach");
  const existing = ticketForChat(chatId);
  if (existing && existing.id !== ticketId) {
    throw new Error(`that thread is already on ${existing.key}`);
  }
  if (existing?.id === ticketId) return existing;
  append("ticket", ticketId, "link", {
    chatId,
    deviceId,
    actor: "you",
    linkedBy: input.linkedBy ?? "you",
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.stage ? { stage: input.stage } : {}),
  });
  return getTicketOrThrow(ticketId);
}

export function unlinkThread(ticketId: string, chatId: string): TicketView {
  if (!getTicket(ticketId)) throw new Error("no such ticket");
  append("ticket", ticketId, "unlink", { chatId, deviceId, actor: "you" });
  return getTicketOrThrow(ticketId);
}

/// Drops a deleted thread off whatever ticket held it. The ticket keeps its
/// story: the link event and everything the thread declared stay on the feed.
export function forgetChat(chatId: string): void {
  const ticket = ticketForChat(chatId);
  if (!ticket) return;
  try {
    unlinkThread(ticket.id, chatId);
  } catch {
    // The ticket went away first, which already removed the link.
  }
}

/// The derived half of the status rule.
///
/// Only ever moves a ticket between In progress and Needs input, and only when
/// it is already in one of them. A ticket you dragged to Done, or one still in
/// Backlog, is left exactly where you put it.
export function syncTicketFromThread(chatId: string, state: string): void {
  const ticket = ticketForChat(chatId);
  if (!ticket || !DERIVED.includes(ticket.status)) return;
  const next: TicketStatus = state === "needs_input" || state === "error" ? "needs_input" : "in_progress";
  if (next === ticket.status) return;
  try {
    setTicketStatus(ticket.id, next, { actor: "remy" });
  } catch {
    // The ticket was deleted mid-turn; the thread carries on regardless.
  }
}

// Renaming a project's slug re-keys its tickets. Registered here rather than
// called from `projects.ts`, which cannot import this module without closing a
// cycle — this one already imports it.
whenSlugChanges((projectId) => {
  runTransaction(() => {
    const rows = db
      .prepare("select id from tickets where project_id = ? and deleted = 0")
      .all(projectId) as { id: string }[];
    for (const row of rows) reproject(row.id);
  });
});

/// Everything the board pane needs in one answer, so opening it is one request
/// rather than one per ticket.
export function boardSnapshot(projectId?: string): {
  tickets: TicketView[];
  agents: ReturnType<typeof listAgents>;
  deviceId: string;
} {
  return { tickets: listTickets(projectId), agents: listAgents(), deviceId };
}
