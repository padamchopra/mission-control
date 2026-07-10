import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export interface Config {
  port: number;
  token: string;
  // Notifications go through ntfy (https://ntfy.sh or a self-hosted server).
  // The topic is a random, unguessable string — subscribe the ntfy app to it.
  ntfyServer: string;
  ntfyTopic: string;
}

export const configDir = join(homedir(), ".mission-control");
const configFile = join(configDir, "config.json");

function load(): Config {
  mkdirSync(configDir, { recursive: true });
  let parsed: Partial<Config> = {};
  if (existsSync(configFile)) {
    try {
      parsed = JSON.parse(readFileSync(configFile, "utf8"));
    } catch {
      parsed = {};
    }
  }
  const config: Config = {
    port: Number(parsed.port) || 8420,
    token: typeof parsed.token === "string" && parsed.token.length >= 32 ? parsed.token : randomBytes(32).toString("hex"),
    ntfyServer: typeof parsed.ntfyServer === "string" && parsed.ntfyServer ? parsed.ntfyServer : "https://ntfy.sh",
    ntfyTopic: typeof parsed.ntfyTopic === "string" && parsed.ntfyTopic ? parsed.ntfyTopic : `mc-${randomBytes(9).toString("hex")}`,
  };
  writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
  chmodSync(configFile, 0o600);
  return config;
}

export const config = load();
