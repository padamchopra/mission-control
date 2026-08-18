import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { configDir } from "./config.js";
import type { ConvEntry, ConvTodo, ContextUsage } from "./transcript.js";
import type { ChatPermissionMode } from "./chat.js";

// Durable storage for chats. Everything else in this server keeps its state in
// a JSON file read whole into memory, which is right for a handful of sessions
// and wrong for conversations: a feed grows without bound, and rewriting the
// whole thing to append one line means the cost of a turn scales with its own
// history. So chats get SQLite — the same choice T3 Code makes, minus the event
// log, because the conversation's real home is Claude's own transcript and this
// is the rendered view of it.
//
// `node:sqlite` is built into Node, so this costs no dependency and nothing at
// install time. It does raise the floor to Node 22.5; older servers keep every
// tmux feature and refuse only to create chats, with a message that says why.

/// The columns of one chat. Its feed and plan live in their own rows.
export interface ChatRow {
  id: string;
  title: string;
  cwd: string;
  model?: string;
  permissionMode: ChatPermissionMode;
  createdAt: number;
  updatedAt: number;
  claudeSessionId?: string;
  turns: number;
  costUsd?: number;
  context?: ContextUsage;
  todos: ConvTodo[];
  error?: string;
}

export interface StoredChat extends ChatRow {
  entries: ConvEntry[];
}

const dbFile = join(configDir, "chats.db");
// The old layout: one JSON file per chat. Imported once, then moved aside.
const legacyDir = join(configDir, "chats");

let db: DatabaseSync | undefined;
let unavailable: string | undefined;

// A dynamic import so a server on an older Node degrades instead of failing to
// boot: the module is missing there (or gated behind a flag), and every other
// feature in this process is unaffected by that.
try {
  const sqlite = await import("node:sqlite");
  mkdirSync(configDir, { recursive: true });
  db = new sqlite.DatabaseSync(dbFile);
  // WAL keeps a reader (the fleet poll) from blocking the writer (a live turn),
  // and `normal` leaves fsync to checkpoints — the right trade for a view that
  // can be rebuilt from Claude's transcript.
  db.exec("pragma journal_mode = wal");
  db.exec("pragma synchronous = normal");
  db.exec("pragma foreign_keys = on");
  migrate(db);
} catch (error) {
  unavailable =
    error instanceof Error && /Cannot find module|not supported|experimental/i.test(error.message)
      ? `this server's Node (${process.version}) has no node:sqlite — chats need Node 22.5 or newer`
      : `could not open ${dbFile}: ${error instanceof Error ? error.message : String(error)}`;
  console.error(`chat storage unavailable: ${unavailable}`);
}

export const chatStorageAvailable = (): boolean => db !== undefined;
export const chatStorageError = (): string | undefined => unavailable;

/// Throws the reason chats cannot be used, for endpoints that need to say so.
export function assertChatStorage(): void {
  if (!db) throw new Error(unavailable ?? "chat storage is unavailable");
}

function migrate(database: DatabaseSync): void {
  const version = Number(
    (database.prepare("pragma user_version").get() as { user_version?: number } | undefined)
      ?.user_version ?? 0,
  );
  if (version < 1) {
    database.exec(`
      create table if not exists chats (
        id text primary key,
        title text not null,
        cwd text not null,
        model text,
        permission_mode text not null,
        created_at integer not null,
        updated_at integer not null,
        claude_session_id text,
        turns integer not null default 0,
        cost_usd real,
        context_json text,
        todos_json text,
        error text
      );
      create table if not exists chat_entries (
        chat_id text not null references chats(id) on delete cascade,
        seq integer not null,
        entry_id text not null,
        json text not null,
        primary key (chat_id, entry_id)
      );
      create index if not exists chat_entries_order on chat_entries(chat_id, seq);
    `);
    database.exec("pragma user_version = 1");
  }
  importLegacyChats(database);
}

/// Brings the JSON-per-chat layout across on first boot, then moves the old
/// directory aside rather than deleting it — this is the only copy of a feed
/// that predates the database.
function importLegacyChats(database: DatabaseSync): void {
  if (!existsSync(legacyDir)) return;
  const files = readdirSync(legacyDir).filter((name) => name.endsWith(".json"));
  let imported = 0;
  for (const name of files) {
    try {
      const record = JSON.parse(readFileSync(join(legacyDir, name), "utf8")) as StoredChat;
      if (!record?.id) continue;
      writeChat(database, {
        ...record,
        turns: record.turns ?? 0,
        todos: record.todos ?? [],
      });
      let seq = 0;
      for (const entry of record.entries ?? []) {
        seq += 1;
        database
          .prepare(
            "insert or replace into chat_entries (chat_id, seq, entry_id, json) values (?, ?, ?, ?)",
          )
          .run(record.id, seq, entry.id, JSON.stringify(entry));
      }
      imported += 1;
    } catch {
      // A corrupt file is skipped rather than blocking every other chat.
    }
  }
  const movedTo = `${legacyDir}-imported-${Date.now()}`;
  try {
    renameSync(legacyDir, movedTo);
  } catch {
    // Leaving it in place is harmless — the import is idempotent by chat id.
    return;
  }
  if (imported > 0) console.log(`imported ${imported} chat(s) into ${dbFile}; old files at ${movedTo}`);
}

function writeChat(database: DatabaseSync, row: ChatRow): void {
  database
    .prepare(
      `insert into chats (
         id, title, cwd, model, permission_mode, created_at, updated_at,
         claude_session_id, turns, cost_usd, context_json, todos_json, error
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         title = excluded.title,
         cwd = excluded.cwd,
         model = excluded.model,
         permission_mode = excluded.permission_mode,
         updated_at = excluded.updated_at,
         claude_session_id = excluded.claude_session_id,
         turns = excluded.turns,
         cost_usd = excluded.cost_usd,
         context_json = excluded.context_json,
         todos_json = excluded.todos_json,
         error = excluded.error`,
    )
    .run(
      row.id,
      row.title,
      row.cwd,
      row.model ?? null,
      row.permissionMode,
      row.createdAt,
      row.updatedAt,
      row.claudeSessionId ?? null,
      row.turns,
      row.costUsd ?? null,
      row.context ? JSON.stringify(row.context) : null,
      row.todos.length ? JSON.stringify(row.todos) : null,
      row.error ?? null,
    );
}

/// Metadata only. A turn touches this on every state change, so it stays a
/// single small row rather than the feed it belongs to.
export function saveChat(row: ChatRow): void {
  if (!db) return;
  writeChat(db, row);
}

/// Upserts one feed entry. `seq` is assigned on first insert and preserved on
/// update, so a streaming entry keeps its place while its text grows.
export function saveEntry(chatId: string, entry: ConvEntry): void {
  if (!db) return;
  db.prepare(
    `insert into chat_entries (chat_id, seq, entry_id, json)
     values (?, (select coalesce(max(seq), 0) + 1 from chat_entries where chat_id = ?), ?, ?)
     on conflict(chat_id, entry_id) do update set json = excluded.json`,
  ).run(chatId, chatId, entry.id, JSON.stringify(entry));
}

export function deleteEntries(chatId: string, entryIds: string[]): void {
  if (!db || entryIds.length === 0) return;
  const statement = db.prepare("delete from chat_entries where chat_id = ? and entry_id = ?");
  for (const id of entryIds) statement.run(chatId, id);
}

/// Keeps the newest `max` entries. Older turns stay in Claude's transcript.
export function trimEntries(chatId: string, max: number): void {
  if (!db) return;
  db.prepare(
    `delete from chat_entries
      where chat_id = ?
        and entry_id not in (
          select entry_id from chat_entries where chat_id = ? order by seq desc limit ?
        )`,
  ).run(chatId, chatId, max);
}

export function removeChat(id: string): void {
  if (!db) return;
  // chat_entries cascades, but only with foreign_keys on — delete both anyway so
  // a database opened without the pragma can't leave orphans behind.
  db.prepare("delete from chat_entries where chat_id = ?").run(id);
  db.prepare("delete from chats where id = ?").run(id);
}

/// Every chat with the tail of its feed, newest chat first.
export function loadChats(entryLimit: number): StoredChat[] {
  if (!db) return [];
  const rows = db.prepare("select * from chats order by updated_at desc").all() as Record<
    string,
    unknown
  >[];
  const entries = db.prepare(
    "select json from chat_entries where chat_id = ? order by seq desc limit ?",
  );
  return rows.map((row) => ({
    ...toChatRow(row),
    entries: readEntries(entries, String(row.id), entryLimit),
  }));
}

function readEntries(statement: StatementSync, chatId: string, limit: number): ConvEntry[] {
  const rows = statement.all(chatId, limit) as { json: string }[];
  const parsed: ConvEntry[] = [];
  // Selected newest-first so the limit takes the tail; the feed reads oldest-first.
  for (const row of rows.reverse()) {
    try {
      parsed.push(JSON.parse(row.json) as ConvEntry);
    } catch {
      // Skip an unreadable entry rather than losing the whole conversation.
    }
  }
  return parsed;
}

function toChatRow(row: Record<string, unknown>): ChatRow {
  return {
    id: String(row.id),
    title: String(row.title),
    cwd: String(row.cwd),
    ...(row.model ? { model: String(row.model) } : {}),
    permissionMode: String(row.permission_mode) as ChatPermissionMode,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(row.claude_session_id ? { claudeSessionId: String(row.claude_session_id) } : {}),
    turns: Number(row.turns ?? 0),
    ...(typeof row.cost_usd === "number" ? { costUsd: row.cost_usd } : {}),
    ...(row.context_json ? { context: parse<ContextUsage>(String(row.context_json)) } : {}),
    todos: row.todos_json ? parse<ConvTodo[]>(String(row.todos_json)) ?? [] : [],
    ...(row.error ? { error: String(row.error) } : {}),
  };
}

function parse<T>(json: string): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}
