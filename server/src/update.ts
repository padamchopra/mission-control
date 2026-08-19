import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getKv, setKv } from "./db.js";

export type ServerUpdateStatus = {
  state: "idle" | "running" | "restarting" | "succeeded" | "failed";
  message: string;
  updatedAt: number;
};

const updateScript = join(dirname(process.cwd()), "deploy", "update-server.sh");

export function updateStatus(): ServerUpdateStatus {
  const parsed = getKv<Partial<ServerUpdateStatus>>("update_status");
  if (
    parsed &&
    typeof parsed.state === "string" &&
    typeof parsed.message === "string" &&
    typeof parsed.updatedAt === "number"
  ) {
    return parsed as ServerUpdateStatus;
  }
  return { state: "idle", message: "No update has been requested", updatedAt: 0 };
}

export function startServerUpdate(): ServerUpdateStatus {
  if (!existsSync(updateScript)) throw new Error("server update script is unavailable");
  const current = updateStatus();
  if (current.state === "running" || current.state === "restarting") return current;
  const child = spawn("/bin/bash", [updateScript], { detached: true, stdio: "ignore" });
  child.unref();
  const status: ServerUpdateStatus = { state: "running", message: "Starting server update", updatedAt: Date.now() };
  setKv("update_status", status);
  return status;
}
