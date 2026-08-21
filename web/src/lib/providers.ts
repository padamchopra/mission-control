/// What a thread can think with: the providers Remy runs, and the models each
/// of them answers to.
///
/// The machine is the authority — `GET /server/providers` answers with the
/// catalogue it validates against, and says which of them is installed there —
/// so this list is the fallback a window paints before the answer arrives.
/// Mirrors `PROVIDERS` in `server/src/providers.ts`.

export interface ProviderModel {
  value: string;
  label: string;
  detail?: string;
}

export interface Provider {
  id: string;
  label: string;
  /// The executable it needs on the machine.
  command: string;
  models: ProviderModel[];
  /// Whether a thread on it can stop and ask you to allow a tool call.
  approvals: boolean;
  /// Whether the machine that answered has it. Absent means nobody has said.
  available?: boolean;
}

export const PROVIDERS: Provider[] = [
  {
    id: "claude",
    label: "Claude",
    command: "claude",
    approvals: true,
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

/// A provider and one of its models. What every picker in Remy reads and writes,
/// because picking a model is picking the thing that runs it.
export interface ModelChoice {
  provider: string;
  model: string;
}

export function providerOf(providers: Provider[], id?: string): Provider | undefined {
  return providers.find((entry) => entry.id === id) ?? providers[0];
}

export function providerLabel(providers: Provider[], id?: string): string {
  return providerOf(providers, id)?.label ?? id ?? "Claude";
}

/// How a choice reads on a toolbar: the model's own name, or the provider's when
/// the model is that provider's default.
export function modelLabel(providers: Provider[], choice: ModelChoice): string {
  const provider = providerOf(providers, choice.provider);
  const model = provider?.models.find((entry) => entry.value === (choice.model ?? ""));
  if (!model) return choice.model || (provider?.label ?? "Default");
  return model.value ? model.label : `${provider?.label ?? "Default"} default`;
}
