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

export function localTargetFromConfig(): LocalTarget {
  const config = readHomeConfig();
  return {
    url: `http://127.0.0.1:${config?.port ?? 8420}`,
    token: process.env.MC_TOKEN ?? config?.token ?? "",
  };
}

export function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

async function reachable(target: LocalTarget): Promise<boolean> {
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

/// The desktop window is useless without the daemon on this machine. If
/// launchd already has it, this returns immediately; otherwise we spawn it as
/// a child and tear it down when the app quits.
export async function ensureLocalServer(serverDir: string, target: LocalTarget): Promise<LocalTarget> {
  if (!isLoopback(target.url)) return target;
  if (await reachable(target)) return { ...target, token: readHomeConfig()?.token || target.token };

  const entry = join(serverDir, "dist/index.js");
  if (!existsSync(entry)) {
    if (!existsSync(join(serverDir, "package.json"))) return target;
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
    const token = readHomeConfig()?.token || target.token;
    if (await reachable({ url: target.url, token })) return { url: target.url, token };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  console.warn("remy: local server did not become reachable");
  return { ...target, token: readHomeConfig()?.token || target.token };
}

export function stopSpawnedServer(): void {
  spawned?.kill();
  spawned = undefined;
}
