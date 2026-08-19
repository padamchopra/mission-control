import { spawn, type ChildProcess, execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface LocalTarget {
  url: string;
  token: string;
}

/// Where the running UI should send `/api`. Env wins; otherwise the on-disk
/// config; otherwise the default loopback port, which `ensureLocalServer` will
/// try to occupy.
export function readLocalTarget(): LocalTarget {
  if (process.env.MC_SERVER_URL) {
    return {
      url: process.env.MC_SERVER_URL.replace(/\/$/, ""),
      token: process.env.MC_TOKEN ?? readHomeConfig()?.token ?? "",
    };
  }
  const config = readHomeConfig();
  return {
    url: `http://127.0.0.1:${config?.port ?? 8420}`,
    token: process.env.MC_TOKEN ?? config?.token ?? "",
  };
}

export function readHomeConfig(): { port: number; token: string } | undefined {
  const dirs = [
    process.env.MC_CONFIG_DIR,
    join(homedir(), ".remy"),
    join(homedir(), ".mission-control"),
  ].filter((dir): dir is string => Boolean(dir));
  for (const dir of dirs) {
    const file = join(dir, "remy.db");
    if (!existsSync(file)) continue;
    try {
      const database = new DatabaseSync(file, { readOnly: true });
      const row = database.prepare("select value from kv where key = ?").get("config") as
        | { value?: string }
        | undefined;
      database.close();
      if (typeof row?.value !== "string") continue;
      const parsed = JSON.parse(row.value) as { port?: unknown; token?: unknown };
      if (typeof parsed.token !== "string" || !parsed.token) continue;
      return { port: Number(parsed.port) || 8420, token: parsed.token };
    } catch {
      // A missing or unreadable database is skipped so a later directory can still win.
    }
  }
  return undefined;
}

export function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

export async function serverReachable(target: LocalTarget): Promise<boolean> {
  const token = target.token || readHomeConfig()?.token || "";
  try {
    const response = await fetch(new URL("/health", target.url), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return response.ok;
  } catch {
    return false;
  }
}

let spawned: ChildProcess | undefined;

/// If the app is up, the local daemon should be too. Skip remote targets — those
/// are someone else's machine. If launchd (or a previous spawn) already holds
/// the port, this is a no-op.
export async function ensureLocalServer(serverDir: string, target: LocalTarget): Promise<void> {
  if (!isLoopback(target.url)) return;
  if (await serverReachable(target)) return;

  const entry = join(serverDir, "dist/index.js");
  if (!existsSync(entry)) {
    await execFile("npm", ["run", "build"], { cwd: serverDir });
  }
  spawned = spawn(process.execPath, [entry], {
    cwd: serverDir,
    stdio: "inherit",
    env: process.env,
  });
  spawned.on("exit", () => {
    if (spawned?.exitCode !== null) spawned = undefined;
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await serverReachable({ ...target, token: readHomeConfig()?.token ?? target.token })) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  console.warn("remy: local server did not become reachable");
}

export function stopSpawnedServer(): void {
  spawned?.kill();
  spawned = undefined;
}
