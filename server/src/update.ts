import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type ServerUpdateStatus = {
  state: "idle" | "running" | "restarting" | "succeeded" | "failed";
  message: string;
  updatedAt: number;
};

const statusPath = join(homedir(), ".mission-control", "update-status.json");
const updateScript = join(dirname(process.cwd()), "deploy", "update-server.sh");

export function updateStatus(): ServerUpdateStatus {
  try {
    const parsed = JSON.parse(readFileSync(statusPath, "utf8")) as Partial<ServerUpdateStatus>;
    if (typeof parsed.state === "string" && typeof parsed.message === "string" && typeof parsed.updatedAt === "number") {
      return parsed as ServerUpdateStatus;
    }
  } catch {
    // An update has not been requested yet, or the status file was interrupted.
  }
  return { state: "idle", message: "No update has been requested", updatedAt: 0 };
}

export function startServerUpdate(): ServerUpdateStatus {
  if (!existsSync(updateScript)) throw new Error("server update script is unavailable");
  const current = updateStatus();
  if (current.state === "running" || current.state === "restarting") return current;
  const child = spawn("/bin/bash", [updateScript], { detached: true, stdio: "ignore" });
  child.unref();
  return { state: "running", message: "Starting server update", updatedAt: Date.now() };
}
