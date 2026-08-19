import { randomUUID } from "node:crypto";
import { type AgentKind } from "./agent.js";
import { db, runTransaction } from "./db.js";
import { nextLoopRun, type LoopFrequency, type LoopSchedule } from "./loop-schedule.js";
import { registry } from "./registry.js";
import { createTaskSession, listWorkspaces } from "./workspaces.js";

export type { LoopFrequency, LoopSchedule } from "./loop-schedule.js";

export interface MissionLoop {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  prompt: string;
  agent: Exclude<AgentKind, "shell">;
  schedule: LoopSchedule;
  enabled: boolean;
  runs: number;
  successfulRuns: number;
  lastRunAt: number | null;
  lastDurationMs: number | null;
  lastError: string | null;
  nextRunAt: number;
  createdAt: number;
}

export interface LoopInput {
  name?: unknown;
  workspaceId?: unknown;
  prompt?: unknown;
  agent?: unknown;
  schedule?: unknown;
  enabled?: unknown;
}

const running = new Set<string>();
let timer: NodeJS.Timeout | null = null;

function load(): MissionLoop[] {
  const rows = db.prepare("select json from loops").all() as { json: string }[];
  return rows.flatMap((row) => {
    try {
      return [JSON.parse(row.json) as MissionLoop];
    } catch {
      return [];
    }
  });
}

function save(loops: MissionLoop[]): void {
  runTransaction(() => {
    db.exec("delete from loops");
    const insert = db.prepare("insert into loops (id, json) values (?, ?)");
    for (const loop of loops) insert.run(loop.id, JSON.stringify(loop));
  });
}

function validSchedule(raw: unknown): LoopSchedule {
  const schedule = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const frequency = String(schedule.frequency ?? "daily") as LoopFrequency;
  if (!["hourly", "daily", "weekdays", "weekly"].includes(frequency)) {
    throw new Error("unsupported loop frequency");
  }
  if (frequency === "hourly") {
    const intervalHours = Math.min(Math.max(Number(schedule.intervalHours) || 1, 1), 168);
    return { frequency, intervalHours };
  }
  const hour = Math.min(Math.max(Number(schedule.hour) || 0, 0), 23);
  const minute = Math.min(Math.max(Number(schedule.minute) || 0, 0), 59);
  if (frequency === "weekly") {
    const weekday = Math.min(Math.max(Number(schedule.weekday) || 0, 0), 6);
    return { frequency, hour, minute, weekday };
  }
  return { frequency, hour, minute };
}

export function listLoops(): MissionLoop[] {
  return load().sort((a, b) => a.nextRunAt - b.nextRunAt);
}

export async function createLoop(input: LoopInput): Promise<MissionLoop> {
  const name = String(input.name ?? "").trim();
  const workspaceId = String(input.workspaceId ?? "").trim();
  const prompt = String(input.prompt ?? "").trim();
  const agent = input.agent === "claude" ? "claude" : input.agent === "codex" ? "codex" : null;
  if (!name) throw new Error("loop name required");
  if (!workspaceId) throw new Error("workspace required");
  if (!prompt) throw new Error("mission required");
  if (!agent) throw new Error("loop agent must be claude or codex");
  const workspace = (await listWorkspaces()).find((candidate) => candidate.id === workspaceId);
  if (!workspace) throw new Error("workspace not found");
  const schedule = validSchedule(input.schedule);
  const now = Date.now();
  const loop: MissionLoop = {
    id: randomUUID(),
    name,
    workspaceId,
    workspaceName: workspace.name,
    prompt,
    agent,
    schedule,
    enabled: input.enabled !== false,
    runs: 0,
    successfulRuns: 0,
    lastRunAt: null,
    lastDurationMs: null,
    lastError: null,
    nextRunAt: nextLoopRun(schedule, now),
    createdAt: now,
  };
  const loops = load();
  loops.push(loop);
  save(loops);
  return loop;
}

export async function updateLoop(id: string, input: LoopInput): Promise<MissionLoop> {
  const loops = load();
  const index = loops.findIndex((loop) => loop.id === id);
  if (index < 0) throw new Error("loop not found");
  const current = loops[index];
  const name = input.name === undefined ? current.name : String(input.name).trim();
  const prompt = input.prompt === undefined ? current.prompt : String(input.prompt).trim();
  const workspaceId = input.workspaceId === undefined ? current.workspaceId : String(input.workspaceId).trim();
  const agent = input.agent === undefined
    ? current.agent
    : input.agent === "claude" ? "claude" : input.agent === "codex" ? "codex" : null;
  if (!name || !prompt || !workspaceId || !agent) throw new Error("invalid loop update");
  const workspace = (await listWorkspaces()).find((candidate) => candidate.id === workspaceId);
  if (!workspace) throw new Error("workspace not found");
  const schedule = input.schedule === undefined ? current.schedule : validSchedule(input.schedule);
  const scheduleChanged = JSON.stringify(schedule) !== JSON.stringify(current.schedule);
  const updated: MissionLoop = {
    ...current,
    name,
    prompt,
    workspaceId,
    workspaceName: workspace.name,
    agent,
    schedule,
    enabled: input.enabled === undefined ? current.enabled : input.enabled === true,
    nextRunAt: scheduleChanged ? nextLoopRun(schedule, Date.now()) : current.nextRunAt,
  };
  loops[index] = updated;
  save(loops);
  return updated;
}

export function deleteLoop(id: string): void {
  const loops = load();
  if (!loops.some((loop) => loop.id === id)) throw new Error("loop not found");
  save(loops.filter((loop) => loop.id !== id));
}

export async function runLoop(id: string, onSessionCreated?: () => void): Promise<{ loop: MissionLoop; session: string }> {
  if (running.has(id)) throw new Error("loop is already running");
  const loops = load();
  const index = loops.findIndex((loop) => loop.id === id);
  if (index < 0) throw new Error("loop not found");
  running.add(id);
  const started = Date.now();
  try {
    const loop = loops[index];
    const session = await createTaskSession(loop.workspaceId, loop.prompt, loop.agent);
    registry.update(session, { agent: loop.agent, state: "working" });
    onSessionCreated?.();
    const finished = Date.now();
    const fresh = load();
    const freshIndex = fresh.findIndex((candidate) => candidate.id === id);
    if (freshIndex < 0) throw new Error("loop was deleted while running");
    const updated: MissionLoop = {
      ...fresh[freshIndex],
      runs: fresh[freshIndex].runs + 1,
      successfulRuns: fresh[freshIndex].successfulRuns + 1,
      lastRunAt: started,
      lastDurationMs: finished - started,
      lastError: null,
      nextRunAt: nextLoopRun(fresh[freshIndex].schedule, started),
    };
    fresh[freshIndex] = updated;
    save(fresh);
    return { loop: updated, session };
  } catch (error) {
    const fresh = load();
    const freshIndex = fresh.findIndex((candidate) => candidate.id === id);
    if (freshIndex >= 0) {
      const failed = fresh[freshIndex];
      fresh[freshIndex] = {
        ...failed,
        runs: failed.runs + 1,
        lastRunAt: started,
        lastDurationMs: Date.now() - started,
        lastError: error instanceof Error ? error.message : "loop run failed",
        nextRunAt: nextLoopRun(failed.schedule, started),
      };
      save(fresh);
    }
    throw error;
  } finally {
    running.delete(id);
  }
}

export function startLoopScheduler(onSessionCreated?: () => void): void {
  if (timer) return;
  timer = setInterval(() => {
    const now = Date.now();
    const due = load().filter((loop) => loop.enabled && loop.nextRunAt <= now && !running.has(loop.id));
    for (const loop of due) {
      void runLoop(loop.id, onSessionCreated).catch((error) => {
        console.error(`loop ${loop.name} failed:`, error);
      });
    }
  }, 30_000);
  timer.unref();
}
