import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";

export type SessionState = "working" | "needs_input" | "idle" | "unknown";

export interface RegistryEntry {
  state: SessionState;
  detail?: string;
  claudeSessionId?: string;
  transcriptPath?: string;
  cwd?: string;
  updatedAt: number;
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

  private persist(): void {
    writeFileSync(stateFile, JSON.stringify(Object.fromEntries(this.entries), null, 2) + "\n");
  }
}

export const registry = new Registry();
