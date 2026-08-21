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
  context?: string;
  resolvedLabel?: string;
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
      { value: "", label: "Default", resolvedLabel: "Opus 5 (1M)" },
      { value: "opus", label: "Opus 5", context: "1M" },
      { value: "claude-fable-5[1m]", label: "Fable 5", context: "1M" },
      { value: "sonnet", label: "Sonnet 5", context: "200K" },
      { value: "haiku", label: "Haiku 4.5", context: "200K" },
      { value: "claude-opus-4-8", label: "Opus 4.8", context: "1M" },
    ],
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    approvals: false,
    models: [
      { value: "", label: "Default", detail: "Whatever Codex is set to." },
      { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
      { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
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
  if (!model.value) return `${provider?.label ?? "Default"} default`;
  return model.context ? `${model.label} (${model.context})` : model.label;
}

export function resolvedModelLabel(providers: Provider[], choice: ModelChoice): string {
  const provider = providerOf(providers, choice.provider);
  const model = provider?.models.find((entry) => entry.value === (choice.model ?? ""));
  if (model?.value) return model.context ? `${model.label} (${model.context})` : model.label;
  return model?.resolvedLabel ?? modelLabel(providers, choice);
}
