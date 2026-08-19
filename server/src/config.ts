import { randomBytes } from "node:crypto";
import { getKv, setKv } from "./db.js";

export { configDir } from "./paths.js";

export interface Config {
  port: number;
  token: string;
  // Notifications go through ntfy (https://ntfy.sh or a self-hosted server).
  // The topic is a random, unguessable string — subscribe the ntfy app to it.
  ntfyServer: string;
  ntfyTopic: string;
  // The context window the sessions on this host run with, for the context
  // meter. Transcripts record the model but not its window size, and the 1M
  // variants share a model id with the 200k ones — so a session running with a
  // larger window has to be declared here. Sessions self-correct upward once
  // they exceed this (or once one auto-compacts, which pins the real ceiling).
  contextLimit: number;
}

function load(): Config {
  const parsed = getKv<Partial<Config>>("config") ?? {};
  const config: Config = {
    port: Number(parsed.port) || 8420,
    token: typeof parsed.token === "string" && parsed.token.length >= 32 ? parsed.token : randomBytes(32).toString("hex"),
    ntfyServer: typeof parsed.ntfyServer === "string" && parsed.ntfyServer ? parsed.ntfyServer : "https://ntfy.sh",
    ntfyTopic: typeof parsed.ntfyTopic === "string" && parsed.ntfyTopic ? parsed.ntfyTopic : `mc-${randomBytes(9).toString("hex")}`,
    contextLimit: Number(parsed.contextLimit) > 0 ? Number(parsed.contextLimit) : 200_000,
  };
  setKv("config", config);
  return config;
}

export const config = load();
