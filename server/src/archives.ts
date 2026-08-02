import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentKind } from "./agent.js";
import { configDir } from "./config.js";
import { type Conversation } from "./transcript.js";

export interface ArchivedChat {
  id: string;
  session: string;
  archivedAt: number;
  agent: AgentKind;
  cwd: string | null;
  conversation: Conversation;
}

const archivesFile = join(configDir, "archives.json");

function load(): ArchivedChat[] {
  if (!existsSync(archivesFile)) return [];
  try {
    const parsed = JSON.parse(readFileSync(archivesFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(archives: ArchivedChat[]): void {
  writeFileSync(archivesFile, JSON.stringify(archives, null, 2) + "\n");
}

export function listArchivedChats(): ArchivedChat[] {
  return load().sort((a, b) => b.archivedAt - a.archivedAt);
}

export function archiveChat(input: Omit<ArchivedChat, "id" | "archivedAt">): ArchivedChat {
  const archive: ArchivedChat = {
    ...input,
    id: randomUUID(),
    archivedAt: Date.now(),
  };
  const archives = load();
  archives.push(archive);
  save(archives);
  return archive;
}

export function deleteArchivedChat(id: string): void {
  const archives = load();
  if (!archives.some((archive) => archive.id === id)) throw new Error("archived chat not found");
  save(archives.filter((archive) => archive.id !== id));
}
