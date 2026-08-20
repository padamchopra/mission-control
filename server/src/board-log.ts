import { randomUUID } from "node:crypto";
import { db, getKv, setKv } from "./db.js";

/// The board's append-only log, and the only way anything on the board changes.
///
/// Tickets, agents and projects are not rows anyone writes to — they are folds
/// of the events recorded here, replayed in a total order every machine agrees
/// on. That is a lot of ceremony for one daemon, and none of it is for one
/// daemon: it is what lets a second machine replay the same events and land on
/// the same board without a coordinator deciding who won.
///
/// The order is `(lamport, deviceId, id)`. Lamport counts events rather than
/// milliseconds, so two machines whose clocks disagree still converge, and the
/// device id breaks the tie the counter cannot. `at` is wall clock, and is only
/// ever shown to a person.

export type LogEntity = "project" | "agent" | "ticket";

export type LogKind =
  | "create"
  | "field"
  | "status"
  | "comment"
  | "handoff"
  | "link"
  | "unlink"
  | "tombstone";

export interface LogEvent {
  id: string;
  deviceId: string;
  lamport: number;
  at: number;
  entity: LogEntity;
  entityId: string;
  kind: LogKind;
  payload: Record<string, unknown>;
}

/// This machine's name in the log. Minted once and kept, because every event
/// ever written carries it — regenerating one would fork the history.
export const deviceId: string = (() => {
  const existing = getKv<string>("deviceId");
  if (typeof existing === "string" && existing.length > 0) return existing;
  const minted = randomUUID();
  setKv("deviceId", minted);
  return minted;
})();

function nextLamport(): number {
  const row = db.prepare("select max(lamport) as high from board_log").get() as { high?: number | null };
  return Number(row?.high ?? 0) + 1;
}

function toEvent(row: Record<string, unknown>): LogEvent {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(row.json)) as Record<string, unknown>;
  } catch {
    // A payload we cannot read is an event we cannot apply; folding skips it
    // rather than losing every other event for the entity.
  }
  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    lamport: Number(row.lamport),
    at: Number(row.at),
    entity: String(row.entity) as LogEntity,
    entityId: String(row.entity_id),
    kind: String(row.kind) as LogKind,
    payload,
  };
}

/// Records one change. The caller reprojects afterwards; this only writes.
export function append(
  entity: LogEntity,
  entityId: string,
  kind: LogKind,
  payload: Record<string, unknown> = {},
): LogEvent {
  const event: LogEvent = {
    id: randomUUID(),
    deviceId,
    lamport: nextLamport(),
    at: Date.now(),
    entity,
    entityId,
    kind,
    payload,
  };
  db.prepare(
    `insert into board_log (id, device_id, lamport, at, entity, entity_id, kind, json)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.deviceId,
    event.lamport,
    event.at,
    event.entity,
    event.entityId,
    event.kind,
    JSON.stringify(event.payload),
  );
  return event;
}

/// Every event for one entity, in the order every machine folds them in.
export function eventsFor(entity: LogEntity, entityId: string): LogEvent[] {
  const rows = db
    .prepare(
      `select * from board_log
        where entity = ? and entity_id = ?
        order by lamport asc, device_id asc, id asc`,
    )
    .all(entity, entityId) as Record<string, unknown>[];
  return rows.map(toEvent);
}

/// Every entity of a kind that the log has ever mentioned, including ones since
/// tombstoned — a fold decides what is still alive, not this.
export function entityIds(entity: LogEntity): string[] {
  const rows = db
    .prepare("select distinct entity_id from board_log where entity = ?")
    .all(entity) as { entity_id: string }[];
  return rows.map((row) => row.entity_id);
}

/// Events a peer has not seen, oldest first. Unused until peering lands, and
/// written now because the cursor it takes is what decides the log's shape.
export function since(lamport: number, limit = 500): LogEvent[] {
  const rows = db
    .prepare(
      `select * from board_log
        where lamport > ?
        order by lamport asc, device_id asc, id asc
        limit ?`,
    )
    .all(lamport, limit) as Record<string, unknown>[];
  return rows.map(toEvent);
}

/// Folds a patch payload onto a record, ignoring keys the payload does not
/// carry. Last write wins per field, which falls out of folding in order.
export function applyFields<T extends object>(
  record: T,
  payload: Record<string, unknown>,
  allowed: readonly (keyof T)[],
): T {
  const next = { ...record } as Record<string, unknown>;
  for (const key of allowed) {
    const value = payload[key as string];
    if (value !== undefined) next[key as string] = value;
  }
  return next as T;
}
