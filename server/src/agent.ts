import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

export type AgentKind = "shell" | "claude" | "codex";

export class AgentUnavailableError extends Error {}
export class AgentStartupError extends Error {}

export function agentKind(value: unknown, fallback: AgentKind = "shell"): AgentKind {
  return value === "claude" || value === "codex" || value === "shell" ? value : fallback;
}

export function agentCommand(agent: AgentKind): string | undefined {
  if (agent === "shell") return undefined;
  const pathDirectories = (process.env.PATH ?? "").split(delimiter).filter(isAbsolute);
  const directories = [
    ...pathDirectories,
    join(homedir(), ".local", "bin"),
    join(homedir(), ".npm-global", "bin"),
  ];
  for (const directory of new Set(directories)) {
    const candidate = join(directory, agent);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Keep looking: launchd commonly has a smaller PATH than an interactive shell.
    }
  }
  const displayName = agent === "claude" ? "Claude Code" : "Codex";
  // What a person reads when they pick a provider this machine does not have,
  // so it names the thing to install rather than the daemon that looked for it.
  throw new AgentUnavailableError(`${displayName} is not installed on this machine.`);
}

export function inferAgent(paneCommand: string, recorded?: AgentKind): AgentKind {
  const command = paneCommand.toLowerCase();
  if (command.includes("codex")) return "codex";
  if (command.includes("claude")) return "claude";
  return recorded ?? "shell";
}
