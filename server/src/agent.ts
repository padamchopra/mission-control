export type AgentKind = "shell" | "claude" | "codex";

export function agentKind(value: unknown, fallback: AgentKind = "shell"): AgentKind {
  return value === "claude" || value === "codex" || value === "shell" ? value : fallback;
}

export function agentCommand(agent: AgentKind): string | undefined {
  if (agent === "shell") return undefined;
  return agent;
}

export function inferAgent(paneCommand: string, recorded?: AgentKind): AgentKind {
  if (recorded) return recorded;
  const command = paneCommand.toLowerCase();
  if (command.includes("codex")) return "codex";
  if (command.includes("claude")) return "claude";
  return "shell";
}
