/// The agents Remy can run a thread on, and what each of them will answer as.
///
/// One catalogue, in one file, because every other place that needs it — the
/// settings a machine holds, an agent's own model, a thread's toolbar, the
/// picker in the window — used to carry its own copy of the same four Claude
/// aliases. A model that is not in here cannot be stored, so a picker can never
/// offer something the CLI would refuse at spawn time.
///
/// Models are named the way each CLI names them on its own command line, so
/// what Remy stores is what the tool is handed.

export type ProviderId = "claude" | "codex";

export interface ProviderModel {
  /// What the CLI is handed. Empty means "say nothing", which leaves the choice
  /// to whatever that tool is already configured with.
  value: string;
  label: string;
  /// One short line about when to reach for it, where that is not obvious.
  detail?: string;
}

export interface Provider {
  id: ProviderId;
  label: string;
  /// The executable this provider needs on the machine, which is also the key
  /// its status arrives under in `/server/tooling`.
  command: string;
  models: ProviderModel[];
  /// Whether a thread on this provider can stop and ask you to allow a tool
  /// call. Codex answers a prompt and exits, with nowhere to come back and ask,
  /// so Remy holds it to a sandbox instead — see `codexSandbox`.
  approvals: boolean;
}

export const PROVIDERS: Provider[] = [
  {
    id: "claude",
    label: "Claude",
    command: "claude",
    approvals: true,
    // Only the aliases Claude Code accepts on the command line. A free-string
    // model would fail at spawn time, long after the picker said it was fine.
    models: [
      { value: "", label: "Default", detail: "Whatever Claude Code is set to." },
      { value: "opus", label: "Opus", detail: "The deepest of the three." },
      { value: "sonnet", label: "Sonnet", detail: "The everyday one." },
      { value: "haiku", label: "Haiku", detail: "Fast and cheap." },
    ],
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    approvals: false,
    models: [
      { value: "", label: "Default", detail: "Whatever Codex is set to." },
      { value: "gpt-5.6-sol", label: "Sol", detail: "The deepest of the three." },
      { value: "gpt-5.6-terra", label: "Terra", detail: "The everyday one." },
      { value: "gpt-5.6-luna", label: "Luna", detail: "Fast and cheap." },
    ],
  },
];

export const DEFAULT_PROVIDER: ProviderId = "claude";

export function provider(id: unknown): Provider | undefined {
  return PROVIDERS.find((entry) => entry.id === id);
}

export function providerId(value: unknown, fallback: ProviderId = DEFAULT_PROVIDER): ProviderId {
  return provider(value)?.id ?? fallback;
}

/// The model as this provider would accept it, or its default when the value
/// belongs to some other provider. Switching a thread from Claude to Codex
/// therefore lands on Codex's default rather than on `sonnet`, which Codex has
/// never heard of.
export function providerModel(id: unknown, value: unknown): string {
  const models = provider(providerId(id))?.models ?? [];
  return models.some((model) => model.value === value) ? String(value) : "";
}

/// True when this provider knows the model, which is how a caller tells "the
/// pair was already consistent" from "the model was replaced".
export function knowsModel(id: unknown, value: unknown): boolean {
  return (provider(providerId(id))?.models ?? []).some((model) => model.value === value);
}

export function modelLabel(id: unknown, value: unknown): string {
  const models = provider(providerId(id))?.models ?? [];
  return models.find((model) => model.value === (value ?? ""))?.label ?? String(value || "Default");
}

/// What a thread on Codex may touch, from the same permission mode a thread on
/// Claude runs under.
///
/// `codex exec` answers a prompt and exits: there is no channel for it to stop
/// and ask on, so an approval Remy would have shown you cannot happen. Rather
/// than quietly granting what you were going to be asked about, Ask fails
/// closed — read-only, the same as Plan — and writing is something you choose.
export function codexSandbox(
  permissionMode: string,
): { sandbox: "read-only" | "workspace-write" | "danger-full-access"; approval: "never" } {
  if (permissionMode === "bypassPermissions") return { sandbox: "danger-full-access", approval: "never" };
  if (permissionMode === "acceptEdits" || permissionMode === "auto") {
    return { sandbox: "workspace-write", approval: "never" };
  }
  return { sandbox: "read-only", approval: "never" };
}
