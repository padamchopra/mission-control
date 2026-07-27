import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";

export type SessionState = "working" | "needs_input" | "idle" | "unknown";

export interface RegistryEntry {
  state: SessionState;
  detail?: string;
  currentAction?: string;
  claudeSessionId?: string;
  transcriptPath?: string;
  cwd?: string;
  notificationsMuted?: boolean;
  activity?: SessionActivity[];
  pending?: PendingMessage[];
  updatedAt: number;
}

/// A prompt sent while the session was mid-turn. Claude Code queues these and
/// picks them up when the turn ends, but that queue lives only in its TUI — it
/// is never written to disk, so no amount of transcript reading can find it.
/// Recording what we sent is the only way any client can show it, and it means
/// a message queued from the Mac is visible on the phone too.
export interface PendingMessage {
  text: string;
  at: number;
}

// Long enough for a genuinely long turn, short enough that a queue we lost track
// of (cleared inside the TUI, say) doesn't linger on screen all day.
const PENDING_TTL_MS = 30 * 60_000;
const MAX_PENDING = 10;

export interface SessionActivity {
  event: string;
  message: string;
  at: number;
}

const stateFile = join(configDir, "registry.json");

class Registry {
  private entries = new Map<string, RegistryEntry>();

  constructor() {
    if (existsSync(stateFile)) {
      try {
        const parsed = JSON.parse(readFileSync(stateFile, "utf8")) as Record<string, RegistryEntry>;
        for (const [name, entry] of Object.entries(parsed)) this.entries.set(name, entry);
      } catch {
        // corrupt state file starts fresh
      }
    }
  }

  update(name: string, patch: Partial<RegistryEntry>): void {
    const prev: RegistryEntry = this.entries.get(name) ?? { state: "unknown", updatedAt: 0 };
    this.entries.set(name, { ...prev, ...patch, updatedAt: Date.now() });
    this.persist();
  }

  view(name: string): RegistryEntry | undefined {
    return this.entries.get(name);
  }

  remove(name: string): void {
    if (this.entries.delete(name)) this.persist();
  }

  rename(from: string, to: string): void {
    const entry = this.entries.get(from);
    if (!entry) return;
    this.entries.delete(from);
    this.entries.set(to, entry);
    this.persist();
  }

  setNotificationsMuted(name: string, muted: boolean): void {
    const prev: RegistryEntry = this.entries.get(name) ?? { state: "unknown", updatedAt: Date.now() };
    this.entries.set(name, { ...prev, notificationsMuted: muted });
    this.persist();
  }

  addPending(name: string, text: string): void {
    const prev: RegistryEntry = this.entries.get(name) ?? { state: "unknown", updatedAt: Date.now() };
    const pending = [...this.livePending(prev), { text, at: Date.now() }].slice(-MAX_PENDING);
    this.entries.set(name, { ...prev, pending });
    this.persist();
  }

  /// Everything still queued, oldest first, with anything stale dropped.
  pending(name: string): PendingMessage[] {
    const entry = this.entries.get(name);
    return entry ? this.livePending(entry) : [];
  }

  /// Forget queued prompts — either because they've turned up in the transcript
  /// (Claude took them) or because the queue was discarded, e.g. by an interrupt.
  dropPending(name: string, texts?: string[]): void {
    const prev = this.entries.get(name);
    if (!prev?.pending?.length) return;
    const remaining = texts
      ? prev.pending.filter((p) => !texts.includes(p.text))
      : [];
    if (remaining.length === prev.pending.length) return;
    this.entries.set(name, { ...prev, pending: remaining });
    this.persist();
  }

  private livePending(entry: RegistryEntry): PendingMessage[] {
    const now = Date.now();
    return (entry.pending ?? []).filter((p) => now - p.at < PENDING_TTL_MS);
  }

  recordActivity(name: string, event: string, message: string): void {
    const prev: RegistryEntry = this.entries.get(name) ?? { state: "unknown", updatedAt: Date.now() };
    const activity = [
      { event, message: message.slice(0, 500), at: Date.now() },
      ...(prev.activity ?? []),
    ].slice(0, 40);
    this.entries.set(name, { ...prev, activity });
    this.persist();
  }

  private persist(): void {
    writeFileSync(stateFile, JSON.stringify(Object.fromEntries(this.entries), null, 2) + "\n");
  }
}

export const registry = new Registry();
