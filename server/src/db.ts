import { chmodSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { configDir } from "./paths.js";

/// One file for everything Remy persists: config, settings, chats, workspaces,
/// loops, archives, and the session registry.
export const dbFile = join(configDir, "remy.db");

const sqlite = await import("node:sqlite");
export const db: DatabaseSync = new sqlite.DatabaseSync(dbFile);
db.exec("pragma journal_mode = wal");
db.exec("pragma synchronous = normal");
db.exec("pragma foreign_keys = on");
migrate(db);
try {
  chmodSync(dbFile, 0o600);
} catch {
  // A freshly created WAL file can race chmod; the next write retries.
}

function migrate(database: DatabaseSync): void {
  database.exec(`
    create table if not exists kv (
      key text primary key,
      value text not null
    );
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
    create table if not exists workspaces (
      id text primary key,
      name text not null,
      path text not null,
      icon text,
      tint text
    );
    create table if not exists loops (
      id text primary key,
      json text not null
    );
    create table if not exists archives (
      id text primary key,
      session text not null,
      archived_at integer not null,
      agent text not null,
      cwd text,
      conversation_json text not null
    );
    create table if not exists registry (
      name text primary key,
      json text not null
    );
  `);
  try {
    database.exec("alter table workspaces add column icon text");
  } catch {
    // Column already exists on databases created after this migration.
  }
  try {
    database.exec("alter table workspaces add column tint text");
  } catch {
    // Column already exists on databases created after this migration.
  }
  database.exec("pragma user_version = 1");
}

export function getKv<T>(key: string): T | undefined {
  const row = db.prepare("select value from kv where key = ?").get(key) as { value?: string } | undefined;
  if (typeof row?.value !== "string") return undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return undefined;
  }
}

export function setKv(key: string, value: unknown): void {
  db.prepare("insert or replace into kv (key, value) values (?, ?)").run(key, JSON.stringify(value));
}

export function runTransaction(work: () => void): void {
  db.exec("begin immediate");
  try {
    work();
    db.exec("commit");
  } catch (error) {
    try {
      db.exec("rollback");
    } catch {
      // The connection is already aborted; the original error is the one to throw.
    }
    throw error;
  }
}
