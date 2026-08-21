import { useEffect, useState } from "react";
import { Check, ChevronDown, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { InputGroupButton, InputGroupText } from "@/components/ui/input-group";
import { ProviderMark } from "@/components/ProviderMark";
import { modelLabel, PROVIDERS, type ModelChoice, type Provider } from "@/lib/providers";
import { useStore } from "@/state/store";
import { cn } from "@/lib/utils";

/// Picking what something thinks with.
///
/// Every place in Remy that chooses a model chooses the provider in the same
/// breath — a thread, an agent, the default for new threads, Remy's own small
/// jobs — so all of them open this one dialog and get a provider and a model
/// back together. The dialog is searchable, because "sonnet" is the word people
/// have in mind rather than the provider it belongs to.
///
/// `OFF` is a value only Remy's own jobs offer: a thread has to run on
/// something.
export const OFF = "off";

/// Matching for a list of eight short names, rather than cmdk's fuzzy default.
///
/// Fuzzy scored "Claude Sonnet" above "Codex Sol" for "sol" — the l came out of
/// Claude — and typing three letters of the model you want and highlighting a
/// different one is worse than matching less. A name that starts with what you
/// typed comes first, one that merely contains it comes after, nothing else
/// matches at all.
function match(value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;
  const fields = [value, ...(keywords ?? [])].map((entry) => entry.toLowerCase());
  if (fields.some((entry) => entry.startsWith(query))) return 2;
  return fields.some((entry) => entry.includes(query)) ? 1 : 0;
}

function useProviders(): Provider[] {
  const providers = useStore((s) => s.providers);
  const loadProviders = useStore((s) => s.loadProviders);

  useEffect(() => {
    void loadProviders().catch(() => {
      // The machine says elsewhere that it is unreachable; the built-in
      // catalogue is enough to paint the picker.
    });
  }, [loadProviders]);

  return providers ?? PROVIDERS;
}

/// The dialog on its own, for a caller that already has a trigger.
export function ModelPicker({
  open,
  onOpenChange,
  value,
  onPick,
  allowOff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ModelChoice;
  onPick: (choice: ModelChoice) => void;
  /// Offers declining the job altogether, for Remy's own model.
  allowOff?: boolean;
}) {
  const providers = useProviders();
  const off = allowOff && value.model === OFF;

  const pick = (choice: ModelChoice) => {
    onOpenChange(false);
    if (choice.provider === value.provider && choice.model === value.model) return;
    onPick(choice);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pick a model"
      description="Search providers and models"
      filter={match}
      showCloseButton={false}
      className="top-[12%] translate-y-0 sm:max-w-[520px]"
    >
      <CommandInput placeholder="Search providers and models" />
      {/* Tall enough that every model of both providers is on screen at once:
          the list is short and known, and scrolling to find Codex's last one
          would be a scroll for nothing. */}
      <CommandList className="max-h-[440px]">
        <CommandEmpty>No model by that name.</CommandEmpty>
        {providers.map((provider) => {
          const missing = provider.available === false;
          return (
            <CommandGroup
              key={provider.id}
              heading={missing ? `${provider.label} — not installed here` : provider.label}
            >
              {provider.models.map((model) => (
                <CommandItem
                  key={`${provider.id}:${model.value}`}
                  // The model first, because the value is what a search is
                  // scored against and cmdk rewards a match at the front:
                  // "Claude Sonnet" scored above "Codex Sol" for "sol", on the
                  // l in Claude. The provider is still in it — both of them
                  // have a Default, and a value has to be its own.
                  value={`${model.label} ${provider.label}`}
                  keywords={[model.value, provider.id].filter(Boolean)}
                  disabled={missing}
                  onSelect={() => pick({ provider: provider.id, model: model.value })}
                >
                  <ProviderMark provider={provider.id} />
                  <span className="min-w-0 truncate">{model.label}</span>
                  {model.detail && (
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{model.detail}</span>
                  )}
                  {!off && provider.id === value.provider && model.value === (value.model ?? "") ? (
                    <Check className="ml-auto" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
        {allowOff && (
          <CommandGroup heading="Or not at all">
            <CommandItem value="off none" onSelect={() => pick({ provider: value.provider, model: OFF })}>
              <CircleSlash />
              <span>Off</span>
              <span className="text-xs text-muted-foreground">Remy names nothing for you.</span>
              {off ? <Check className="ml-auto" /> : null}
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/// The picker with its own button, which is how most places want it.
///
/// `variant` is only which button it wears: `composer` sits on a thread's
/// toolbar beside the other `InputGroup` controls, `field` in a settings row
/// beside the menus it replaced.
export function ModelPickerButton({
  value,
  onPick,
  variant = "field",
  allowOff,
  disabled,
  title,
  id,
  className,
}: {
  value: ModelChoice;
  onPick: (choice: ModelChoice) => void;
  variant?: "composer" | "field";
  allowOff?: boolean;
  /// Read-only, for a thread that is mid-turn. The value still shows.
  disabled?: boolean;
  title?: string;
  id?: string;
  className?: string;
}) {
  const providers = useProviders();
  const [open, setOpen] = useState(false);
  const label = value.model === OFF ? "Off" : modelLabel(providers, value);
  const mark = <ProviderMark provider={value.provider} />;

  if (disabled && variant === "composer") {
    return (
      <InputGroupText data-model-picker="" title={title} className="max-w-40 truncate">
        {mark}
        {label}
      </InputGroupText>
    );
  }

  return (
    <>
      {variant === "composer" ? (
        <InputGroupButton data-model-picker="" aria-label="Model" title={title} onClick={() => setOpen(true)}>
          {mark}
          <span className="max-w-40 truncate">{label}</span>
          <ChevronDown />
        </InputGroupButton>
      ) : (
        <Button
          data-model-picker=""
          id={id}
          type="button"
          variant="outline"
          size="sm"
          title={title}
          disabled={disabled}
          className={cn("w-56 shrink-0 justify-start font-normal", className)}
          onClick={() => setOpen(true)}
        >
          {mark}
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="ml-auto opacity-50" />
        </Button>
      )}
      <ModelPicker open={open} onOpenChange={setOpen} value={value} onPick={onPick} allowOff={allowOff} />
    </>
  );
}

/// One provider, as the machine describes it — its name, its models, and
/// whether a thread on it can stop and ask. What a caller needs to name the
/// provider, and to say why a permission means something different here.
export function useProvider(id?: string): Provider | undefined {
  const providers = useProviders();
  return providers.find((entry) => entry.id === id);
}
