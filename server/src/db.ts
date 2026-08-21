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
      -- Which agent runs this thread, and the id that resumes it there. Each
      -- provider keeps its own transcript, so each has its own column: a thread
      -- that ran on one is not resumable on the other.
      provider text not null default 'claude',
      codex_thread_id text,
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
    -- The board. Every mutation is an event; the tables below are folds of it,
    -- rebuilt from the log rather than written to directly. That is what lets a
    -- second machine replay the same events and land on the same board.
    create table if not exists board_log (
      id text primary key,
      device_id text not null,
      lamport integer not null,
      at integer not null,
      entity text not null,
      entity_id text not null,
      kind text not null,
      json text not null
    );
    create index if not exists board_log_entity on board_log(entity, entity_id, lamport);
    create index if not exists board_log_cursor on board_log(lamport, device_id);
    create table if not exists projects (
      id text primary key,
      name text not null,
      key_prefix text not null,
      origin text,
      counter integer not null default 0,
      created_at integer not null,
      updated_at integer not null,
      deleted integer not null default 0
    );
    -- Local, not projected: which folder on *this* disk a synced project is.
    create table if not exists project_workspaces (
      project_id text not null,
      workspace_id text not null,
      primary key (project_id, workspace_id)
    );
    create table if not exists agents (
      id text primary key,
      name text not null,
      handle text not null,
      role text,
      instructions text not null default '',
      provider text not null default 'claude',
      model text,
      permission_mode text not null default 'default',
      avatar text,
      tint text,
      auto_start integer not null default 1,
      handoff_to text,
      git_identity text not null default 'author',
      git_name text,
      git_email text,
      preset text,
      created_at integer not null,
      updated_at integer not null,
      deleted integer not null default 0
    );
    create table if not exists tickets (
      id text primary key,
      -- The number is what a ticket owns; the key is that number behind its
      -- project's slug, recomputed whenever either changes.
      number integer not null default 0,
      key text not null,
      project_id text not null,
      title text not null,
      body text not null default '',
      status text not null default 'backlog',
      priority integer not null default 0,
      assignee_agent_id text,
      parent_id text,
      rank text not null default 'n',
      device_id text,
      branch text,
      handoffs integer not null default 0,
      created_at integer not null,
      updated_at integer not null,
      started_at integer,
      closed_at integer,
      deleted integer not null default 0
    );
    create index if not exists tickets_project on tickets(project_id, status);
    create table if not exists ticket_threads (
      ticket_id text not null,
      device_id text not null,
      chat_id text not null,
      agent_id text,
      stage text,
      linked_by text not null default 'you',
      created_at integer not null,
      primary key (ticket_id, device_id, chat_id)
    );
    create index if not exists ticket_threads_chat on ticket_threads(chat_id);
    -- The other machines this one is paired with. The token is theirs, not
    -- ours: it is what this daemon presents when it calls them, which is why
    -- pairing lives here rather than in any one client.
    create table if not exists peers (
      id text primary key,
      name text not null,
      url text not null,
      token text not null,
      icon text,
      -- Whether notifications raised here are routed to that machine.
      notify integer not null default 0,
      paired_at integer not null,
      last_seen integer
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
  try {
    database.exec("alter table chats add column agent_id text");
  } catch {
    // Column already exists on databases created after this migration.
  }
  try {
    database.exec("alter table tickets add column number integer not null default 0");
  } catch {
    // Column already exists on databases created after this migration.
  }
  try {
    database.exec("alter table chats add column provider text not null default 'claude'");
  } catch {
    // Column already exists on databases created after this migration.
  }
  try {
    database.exec("alter table chats add column codex_thread_id text");
  } catch {
    // Column already exists on databases created after this migration.
  }
  database.exec("pragma user_version = 2");
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
