import { randomUUID } from "node:crypto";
import { WORKSPACE_AGENT, getAgent } from "./agents.js";
import { append, applyFields, deviceId, entityIds, eventsFor, type LogEvent } from "./board-log.js";
import { db, runTransaction } from "./db.js";
import { getProject } from "./projects.js";
import { YOU, createTicket, type TicketView } from "./tickets.js";

/// Work that comes back.
///
/// A recurring ticket is not a scheduled prompt: it is a ticket Remy writes
/// again on a cadence, already on the board and already handed to whoever is
/// meant to do it. Wanting something done every Monday is wanting a ticket
/// every Monday, so that is what this mints — and everything the board already
/// knows how to do with a ticket applies to it unchanged.
///
/// Like the rest of the board these are folds of the log rather than rows
/// anyone writes to, and the run that wrote today's ticket is an event on it —
/// which is what keeps two paired machines from each believing the day still
/// owes a ticket.

export type Cadence = "daily" | "weekdays" | "weekly" | "monthly";

export const CADENCES: Cadence[] = ["daily", "weekdays", "weekly", "monthly"];

export interface Recurrence {
  id: string;
  projectId: string;
  /// What each ticket it writes is called, and what goes in its description.
  title: string;
  body: string;
  /// Who the tickets are handed to: an agent's id, `you`, `workspace` for the
  /// workspace's own model, or nothing.
  assigneeAgentId?: string;
  cadence: Cadence;
  /// Local wall clock on the machine that owns it. A ticket due at nine is due
  /// at nine where the work happens, not in UTC.
  hour: number;
  minute: number;
  /// Sunday = 0, for `weekly`.
  weekday?: number;
  /// Day of the month for `monthly`, 1 to 28 so every month has one.
  day?: number;
  enabled: boolean;
  /// The machine that writes the tickets. Decided when the recurrence is made,
  /// so no second machine writes the same day twice.
  deviceId?: string;
  runs: number;
  lastRunAt?: number;
  /// Why the last run wrote nothing, if it failed. Cleared by the next one that
  /// works.
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RecurrenceView extends Recurrence {
  /// When the next ticket is due. Derived from the cadence and the last run
  /// rather than stored, so a cadence you change takes effect immediately.
  nextRunAt: number;
}

const EDITABLE = [
  "title",
  "body",
  "assigneeAgentId",
  "cadence",
  "hour",
  "minute",
  "weekday",
  "day",
  "enabled",
  "deviceId",
] as const;

// ── the clock ───────────────────────────────────────────────────────────────

type Schedule = Pick<Recurrence, "cadence" | "hour" | "minute" | "weekday" | "day">;

function due(schedule: Schedule, candidate: Date): boolean {
  if (schedule.cadence === "daily") return true;
  if (schedule.cadence === "weekdays") {
    const day = candidate.getDay();
    return day >= 1 && day <= 5;
  }
  if (schedule.cadence === "weekly") return candidate.getDay() === (schedule.weekday ?? 1);
  return candidate.getDate() === (schedule.day ?? 1);
}

/// The first time this cadence comes round after `after`.
///
/// Walked a day at a time in local time rather than by adding milliseconds, so
/// a ticket due at nine is still due at nine on the day the clocks change.
export function nextRun(schedule: Schedule, after: number): number {
  const from = new Date(after);
  const candidate = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    schedule.hour,
    schedule.minute,
    0,
    0,
  );
  // A month at the far end of February is the longest wait a cadence can ask
  // for; a year of days is room to spare.
  for (let step = 0; step < 400; step += 1) {
    if (candidate.getTime() > after && due(schedule, candidate)) return candidate.getTime();
    candidate.setDate(candidate.getDate() + 1);
  }
  throw new Error("could not work out when that comes round again");
}

// ── projection ──────────────────────────────────────────────────────────────

function cadence(value: unknown, fallback: Cadence = "weekly"): Cadence {
  return CADENCES.includes(value as Cadence) ? (value as Cadence) : fallback;
}

function fold(id: string, events: LogEvent[]): Recurrence | undefined {
  let recurrence: Recurrence | undefined;
  for (const event of events) {
    if (event.kind === "tombstone") return undefined;
    if (event.kind === "create") {
      recurrence = {
        id,
        projectId: String(event.payload.projectId ?? ""),
        title: String(event.payload.title ?? "Untitled"),
        body: String(event.payload.body ?? ""),
        cadence: cadence(event.payload.cadence),
        hour: Number(event.payload.hour ?? 9),
        minute: Number(event.payload.minute ?? 0),
        enabled: event.payload.enabled !== false,
        runs: 0,
        createdAt: event.at,
        updatedAt: event.at,
      };
      recurrence = applyFields(recurrence, event.payload, EDITABLE);
      recurrence.cadence = cadence(recurrence.cadence);
      continue;
    }
    if (!recurrence) continue;
    if (event.kind === "field") {
      recurrence = { ...applyFields(recurrence, event.payload, EDITABLE), updatedAt: event.at };
      recurrence.cadence = cadence(recurrence.cadence);
      continue;
    }
    if (event.kind === "ran") {
      const failed = typeof event.payload.error === "string" ? event.payload.error : undefined;
      recurrence = {
        ...recurrence,
        // `runs` counts tickets, not attempts, so a failure does not read as
        // work that happened.
        runs: recurrence.runs + (failed ? 0 : 1),
        lastRunAt: event.at,
        ...(failed ? { lastError: failed } : {}),
        updatedAt: event.at,
      };
      if (!failed) delete recurrence.lastError;
    }
  }
  return recurrence;
}

/// When the next ticket is due: one cadence on from the last run, or from when
/// the recurrence was written if it has never run. Measured from the run rather
/// than from now, so a machine that was asleep writes one ticket and carries on
/// rather than catching up on a week of them.
function nextRunFor(recurrence: Recurrence): number {
  return nextRun(recurrence, recurrence.lastRunAt ?? recurrence.createdAt);
}

export function reproject(id: string): RecurrenceView | undefined {
  const events = eventsFor("recurrence", id);
  const recurrence = events.length ? fold(id, events) : undefined;
  if (!recurrence) {
    db.prepare("update recurrences set deleted = 1 where id = ?").run(id);
    return undefined;
  }
  db.prepare(
    `insert into recurrences (
       id, project_id, title, body, assignee_agent_id, cadence, hour, minute,
       weekday, day, enabled, device_id, runs, last_run_at, last_error,
       created_at, updated_at, deleted
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     on conflict(id) do update set
       project_id = excluded.project_id, title = excluded.title, body = excluded.body,
       assignee_agent_id = excluded.assignee_agent_id, cadence = excluded.cadence,
       hour = excluded.hour, minute = excluded.minute, weekday = excluded.weekday,
       day = excluded.day, enabled = excluded.enabled, device_id = excluded.device_id,
       runs = excluded.runs, last_run_at = excluded.last_run_at,
       last_error = excluded.last_error, updated_at = excluded.updated_at, deleted = 0`,
  ).run(
    recurrence.id,
    recurrence.projectId,
    recurrence.title,
    recurrence.body,
    recurrence.assigneeAgentId || null,
    recurrence.cadence,
    recurrence.hour,
    recurrence.minute,
    recurrence.weekday ?? null,
    recurrence.day ?? null,
    recurrence.enabled ? 1 : 0,
    recurrence.deviceId || null,
    recurrence.runs,
    recurrence.lastRunAt ?? null,
    recurrence.lastError ?? null,
    recurrence.createdAt,
    recurrence.updatedAt,
  );
  return { ...recurrence, nextRunAt: nextRunFor(recurrence) };
}

export function reprojectAll(): void {
  runTransaction(() => {
    for (const id of entityIds("recurrence")) reproject(id);
  });
}

function toRecurrence(row: Record<string, unknown>): RecurrenceView {
  const recurrence: Recurrence = {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    body: String(row.body ?? ""),
    ...(row.assignee_agent_id ? { assigneeAgentId: String(row.assignee_agent_id) } : {}),
    cadence: cadence(row.cadence),
    hour: Number(row.hour ?? 9),
    minute: Number(row.minute ?? 0),
    ...(row.weekday === null || row.weekday === undefined ? {} : { weekday: Number(row.weekday) }),
    ...(row.day === null || row.day === undefined ? {} : { day: Number(row.day) }),
    enabled: Number(row.enabled) === 1,
    ...(row.device_id ? { deviceId: String(row.device_id) } : {}),
    runs: Number(row.runs ?? 0),
    ...(row.last_run_at ? { lastRunAt: Number(row.last_run_at) } : {}),
    ...(row.last_error ? { lastError: String(row.last_error) } : {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
  return { ...recurrence, nextRunAt: nextRunFor(recurrence) };
}

// ── reading ─────────────────────────────────────────────────────────────────

export function listRecurrences(projectId?: string): RecurrenceView[] {
  const rows = (
    projectId
      ? db
          .prepare("select * from recurrences where deleted = 0 and project_id = ? order by created_at asc")
          .all(projectId)
      : db.prepare("select * from recurrences where deleted = 0 order by created_at asc").all()
  ) as Record<string, unknown>[];
  return rows.map(toRecurrence).sort((a, b) => a.nextRunAt - b.nextRunAt);
}

export function getRecurrence(id: string): RecurrenceView | undefined {
  const row = db.prepare("select * from recurrences where id = ? and deleted = 0").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? toRecurrence(row) : undefined;
}

// ── writing ─────────────────────────────────────────────────────────────────

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function bounded(value: unknown, low: number, high: number, fallback: number): number {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, low), high);
}

function validate(input: Record<string, unknown>, existing?: Recurrence): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = text(input.title, 200);
    if (!title) throw new Error("a recurring ticket needs a title");
    patch.title = title;
  }
  if (input.body !== undefined) patch.body = typeof input.body === "string" ? input.body.slice(0, 20000) : "";
  if (input.assigneeAgentId !== undefined) {
    const id = text(input.assigneeAgentId, 64);
    if (id && id !== YOU && id !== WORKSPACE_AGENT && !getAgent(id)) throw new Error("no such agent");
    patch.assigneeAgentId = id ?? "";
  }
  if (input.cadence !== undefined) {
    if (!CADENCES.includes(input.cadence as Cadence)) throw new Error("pick how often this comes round");
    patch.cadence = input.cadence;
  }
  if (input.hour !== undefined) patch.hour = bounded(input.hour, 0, 23, existing?.hour ?? 9);
  if (input.minute !== undefined) patch.minute = bounded(input.minute, 0, 59, existing?.minute ?? 0);
  if (input.weekday !== undefined) patch.weekday = bounded(input.weekday, 0, 6, existing?.weekday ?? 1);
  // Held to 28 so a monthly ticket exists in February as well as in March.
  if (input.day !== undefined) patch.day = bounded(input.day, 1, 28, existing?.day ?? 1);
  if (input.enabled !== undefined) patch.enabled = input.enabled !== false;
  // Which machine writes the tickets is movable, the way a ticket's device is.
  if (input.deviceId !== undefined) patch.deviceId = text(input.deviceId, 64) ?? "";
  return patch;
}

export function createRecurrence(input: Record<string, unknown>): RecurrenceView {
  const projectId = String(input.projectId ?? "");
  if (!getProject(projectId)) throw new Error("pick a project for this ticket");
  const patch = validate(input);
  if (!patch.title) throw new Error("a recurring ticket needs a title");

  const id = randomUUID();
  append("recurrence", id, "create", {
    projectId,
    cadence: "weekly",
    hour: 9,
    minute: 0,
    weekday: 1,
    day: 1,
    enabled: true,
    // It runs where it was written, like a ticket does.
    deviceId,
    ...patch,
  });
  return getOrThrow(id);
}

function getOrThrow(id: string): RecurrenceView {
  reproject(id);
  const recurrence = getRecurrence(id);
  if (!recurrence) throw new Error("no such recurring ticket");
  return recurrence;
}

export function updateRecurrence(id: string, input: Record<string, unknown>): RecurrenceView {
  const existing = getRecurrence(id);
  if (!existing) throw new Error("no such recurring ticket");
  const patch = validate(input, existing);
  if (Object.keys(patch).length === 0) return existing;
  append("recurrence", id, "field", patch);
  return getOrThrow(id);
}

export function deleteRecurrence(id: string): void {
  if (!getRecurrence(id)) throw new Error("no such recurring ticket");
  append("recurrence", id, "tombstone", {});
  reproject(id);
}

/// Writes this recurrence's next ticket, now.
///
/// The run is recorded whether or not the ticket landed, so a recurrence whose
/// project has gone waits for its next turn rather than trying again every
/// minute for the rest of the day.
export function runRecurrence(id: string): { recurrence: RecurrenceView; ticket: TicketView } {
  const recurrence = getRecurrence(id);
  if (!recurrence) throw new Error("no such recurring ticket");
  try {
    const ticket = createTicket(
      {
        projectId: recurrence.projectId,
        title: recurrence.title,
        body: recurrence.body,
        // Todo rather than Backlog: a recurring ticket is work that is wanted
        // now, which is the whole reason it recurs.
        status: "todo",
        ...(recurrence.assigneeAgentId ? { assigneeAgentId: recurrence.assigneeAgentId } : {}),
      },
      "remy",
    );
    append("recurrence", id, "ran", { ticketId: ticket.id, actor: "remy" });
    return { recurrence: getOrThrow(id), ticket };
  } catch (error) {
    const message = (error as Error).message || "could not write that ticket";
    append("recurrence", id, "ran", { error: message, actor: "remy" });
    reproject(id);
    throw error;
  }
}

/// Every ticket that is due right now, written.
///
/// Exported so a test can drive the clock rather than wait for it. Only
/// recurrences this machine owns are minted here: the machine on the event is
/// the one that writes the ticket, so a paired laptop does not write Monday's
/// ticket a second time.
export function writeDueTickets(now = Date.now()): TicketView[] {
  const written: TicketView[] = [];
  for (const recurrence of listRecurrences()) {
    if (!recurrence.enabled) continue;
    if ((recurrence.deviceId ?? deviceId) !== deviceId) continue;
    if (recurrence.nextRunAt > now) continue;
    try {
      written.push(runRecurrence(recurrence.id).ticket);
    } catch (error) {
      console.error(`could not write the recurring ticket ${recurrence.title}:`, error);
    }
  }
  return written;
}

let timer: NodeJS.Timeout | null = null;

export function startRecurringTickets(onWrote?: () => void): void {
  if (timer) return;
  timer = setInterval(() => {
    if (writeDueTickets().length > 0) onWrote?.();
  }, 60_000);
  timer.unref();
}
