import { useEffect, useMemo, useState } from "react";
import { Bot, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EditableName } from "@/components/EditableName";
import { ModelPickerButton } from "@/components/ModelPicker";
import { apiError } from "@/lib/api-error";
import type { ModelChoice } from "@/lib/providers";
import { TINT_IDS, tintOf } from "@/lib/tints";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { Agent } from "@/state/types";

/// The roster, as a list and a detail rather than a dialog.
///
/// An agent has more to say than a modal has room for — instructions alone want
/// a real textarea — and picking one is a place you can be, so it lives in the
/// URL and a reload lands back on it.
///
/// Everything saves as you go, the way the rest of Settings does. Menus and
/// switches save on change; text saves when you leave the field, because saving
/// a paragraph on every keystroke is a write per character.

const PERMISSIONS = [
  { value: "plan", label: "Plan only", detail: "Reads and proposes. Changes nothing." },
  { value: "default", label: "Ask first", detail: "Stops for every edit and command." },
  { value: "acceptEdits", label: "Edit freely", detail: "Writes files without asking." },
  { value: "bypassPermissions", label: "No prompts", detail: "Never stops to ask." },
];

const IDENTITIES = [
  { value: "off", label: "Yours", detail: "Commits carry your name, as they do now." },
  { value: "author", label: "Author", detail: "The agent authors it, you commit it." },
  { value: "full", label: "Author and committer", detail: "The agent takes both names." },
];

export function AgentsPane({
  selected,
  onSelect,
  defaultGitIdentity,
  defaultProvider,
  defaultModel,
  onSaveDefaultIdentity,
  onSaveDefault,
}: {
  /// The handle in the URL, if one is there.
  selected?: string;
  onSelect: (handle?: string) => void;
  defaultGitIdentity: string;
  defaultProvider: string;
  defaultModel: string;
  onSaveDefaultIdentity: (value: string) => void;
  onSaveDefault: (choice: ModelChoice) => void;
}) {
  const agents = useStore((s) => s.agents);
  const loadBoard = useStore((s) => s.loadBoard);
  const saveAgent = useStore((s) => s.saveAgent);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void loadBoard().catch(() => {
      // An unreachable machine already says so elsewhere.
    });
  }, [loadBoard]);

  const agent = useMemo(
    () => agents.find((entry) => entry.handle === selected) ?? agents[0],
    [agents, selected],
  );

  // A tab opened with no agent named lands on the first one, written into the
  // URL so a reload and the back button agree with the screen.
  //
  // Only when the URL names none. A URL naming an agent that is not in the list
  // is left alone: it is almost always a list that has not arrived yet, and
  // rewriting it would yank you off the agent you just created.
  useEffect(() => {
    if (!selected && agents[0]) onSelect(agents[0].handle);
  }, [selected, agents, onSelect]);

  const create = async () => {
    setCreating(true);
    try {
      // Created straight away rather than behind a form: the pane it lands in
      // is the form, and the server makes the handle unique.
      const made = await saveAgent(undefined, {
        name: "New agent",
        gitIdentity: defaultGitIdentity,
        provider: defaultProvider,
        model: defaultModel,
      });
      onSelect(made.handle);
    } catch (error) {
      toast.error("Couldn't create that agent", { description: apiError(error) });
    } finally {
      setCreating(false);
    }
  };

  if (agents.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bot />
          </EmptyMedia>
          <EmptyTitle>No agents yet</EmptyTitle>
          <EmptyDescription>Write one, and a thread can run as it.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => void create()} disabled={creating}>
            <Plus />
            New agent
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="Agents"
        className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar/40"
      >
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-0.5 p-2">
            {agents.map((entry) => {
              const colors = tintOf(entry.tint);
              const active = entry.handle === agent?.handle;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => onSelect(entry.handle)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active ? "bg-sidebar-row-selected" : "hover:bg-sidebar-row-hover",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md",
                        colors.well,
                        colors.fg,
                      )}
                    >
                      <Bot className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm leading-5">{entry.name}</span>
                      <span className="block truncate font-mono text-[10px] leading-4 text-muted-foreground">
                        @{entry.handle}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            disabled={creating}
            onClick={() => void create()}
          >
            <Plus />
            New agent
          </Button>
        </div>
      </nav>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
          <Field orientation="horizontal" className="items-center">
            <FieldContent>
              <FieldLabel htmlFor="default-model">What new agents think with</FieldLabel>
              <FieldDescription className="text-xs">
                Also what a new thread starts on. Each agent can say otherwise.
              </FieldDescription>
            </FieldContent>
            <ModelPickerButton
              id="default-model"
              value={{ provider: defaultProvider, model: defaultModel }}
              onPick={onSaveDefault}
            />
          </Field>

          <Field orientation="horizontal" className="items-center">
            <FieldContent>
              <FieldLabel htmlFor="default-git-identity">Git identity for new agents</FieldLabel>
              <FieldDescription className="text-xs">
                Which of git's two names an agent takes. Attribution, not proof.
              </FieldDescription>
            </FieldContent>
            <Select value={defaultGitIdentity} onValueChange={onSaveDefaultIdentity}>
              <SelectTrigger id="default-git-identity" size="sm" className="w-56 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {IDENTITIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Separator />

          {agent && <AgentDetail key={agent.id} agent={agent} onDeleted={() => onSelect(undefined)} />}
        </div>
      </ScrollArea>
    </div>
  );
}

function AgentDetail({ agent, onDeleted }: { agent: Agent; onDeleted: () => void }) {
  const agents = useStore((s) => s.agents);
  const saveAgent = useStore((s) => s.saveAgent);
  const deleteAgent = useStore((s) => s.deleteAgent);

  // Text fields are held here while they are being typed and written when the
  // field is left, so a paragraph is one save rather than one per character.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const text = (key: keyof Agent) => draft[key] ?? ((agent[key] as string | undefined) ?? "");

  const save = async (patch: Record<string, unknown>, what: string) => {
    try {
      await saveAgent(agent.id, patch);
    } catch (error) {
      toast.error(`Couldn't change ${what}`, { description: apiError(error) });
      // Put the field back to what the server still believes.
      setDraft((current) => {
        const next = { ...current };
        for (const key of Object.keys(patch)) delete next[key];
        return next;
      });
    }
  };

  /// Writes only when the field actually changed, so tabbing through the pane
  /// is not a dozen writes.
  const commit = (key: keyof Agent, what: string) => () => {
    const value = draft[key as string];
    if (value === undefined || value === (agent[key] ?? "")) return;
    void save({ [key]: value }, what);
  };

  const colors = tintOf(agent.tint);
  const identity = agent.gitIdentity;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-3">
        <span
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", colors.well, colors.fg)}
        >
          <Bot className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <EditableName
            value={agent.name}
            label="agent name"
            className="text-lg leading-tight font-semibold"
            onCommit={(name) => void save({ name }, "the name")}
          />
          <span className="font-mono text-xs text-muted-foreground">@{agent.handle}</span>
        </div>
        <AlertDialog>
          {/* Both triggers are `asChild`, so they have to collapse onto the one
              button — a Tooltip root in between would swallow the dialog's
              props and the button would open nothing. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${agent.name}`}>
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Delete agent</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {agent.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Threads it already started keep running. Tickets assigned to it lose their assignee.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  void deleteAgent(agent.id)
                    .then(onDeleted)
                    .catch((error) => toast.error("Couldn't delete that agent", { description: apiError(error) }))
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      <Field>
        <FieldLabel htmlFor="agent-role">Role</FieldLabel>
        <FieldDescription className="text-xs">One line, shown under the name.</FieldDescription>
        <Input
          id="agent-role"
          value={text("role")}
          placeholder="Implements the ticket in its own worktree"
          onChange={(event) => setDraft((c) => ({ ...c, role: event.target.value }))}
          onBlur={commit("role", "the role")}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="agent-handle">Handle</FieldLabel>
        <FieldDescription className="text-xs">
          What another agent hands a ticket to, and what the CLI will take.
        </FieldDescription>
        <Input
          id="agent-handle"
          className="font-mono"
          value={text("handle")}
          onChange={(event) => setDraft((c) => ({ ...c, handle: event.target.value }))}
          onBlur={commit("handle", "the handle")}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="agent-instructions">Instructions</FieldLabel>
        <FieldDescription className="text-xs">
          Added to Claude Code's own, not swapped for them.
        </FieldDescription>
        <Textarea
          id="agent-instructions"
          rows={12}
          className="font-normal"
          value={text("instructions")}
          placeholder="How this agent works, in the second person."
          onChange={(event) => setDraft((c) => ({ ...c, instructions: event.target.value }))}
          onBlur={commit("instructions", "the instructions")}
        />
      </Field>

      <Field>
        <FieldLabel>Colour</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {TINT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-label={id}
              aria-pressed={agent.tint === id}
              onClick={() => void save({ tint: id }, "the colour")}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                tintOf(id).swatch,
                agent.tint === id && "ring-2 ring-primary",
              )}
            />
          ))}
        </div>
      </Field>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="agent-model">Thinks with</FieldLabel>
          <ModelPickerButton
            id="agent-model"
            className="w-full"
            value={{ provider: agent.provider || "claude", model: agent.model ?? "" }}
            onPick={(next) => void save({ provider: next.provider, model: next.model }, "what it thinks with")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="agent-permission">May do unasked</FieldLabel>
          <Select
            value={agent.permissionMode}
            onValueChange={(next) => void save({ permissionMode: next }, "what it may do unasked")}
          >
            <SelectTrigger id="agent-permission" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PERMISSIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <FieldDescription className="-mt-3 text-xs">
        {PERMISSIONS.find((option) => option.value === agent.permissionMode)?.detail}
      </FieldDescription>

      <Separator />

      <Field>
        <FieldLabel htmlFor="agent-identity">Git identity</FieldLabel>
        <FieldDescription className="text-xs">
          {IDENTITIES.find((option) => option.value === identity)?.detail} Attribution, not proof.
        </FieldDescription>
        <Select
          value={identity}
          onValueChange={(next) => void save({ gitIdentity: next }, "what it signs commits with")}
        >
          <SelectTrigger id="agent-identity" size="sm" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {IDENTITIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      {identity !== "off" && (
        <Field>
          <FieldLabel htmlFor="agent-git-name">Name on commits</FieldLabel>
          <FieldDescription className="text-xs">
            Beside it goes <span className="font-mono">{agent.gitEmail}</span>, from its handle and
            your GitHub account.
          </FieldDescription>
          <Input
            id="agent-git-name"
            className="sm:w-64"
            value={text("gitName")}
            placeholder={agent.name}
            onChange={(event) => setDraft((c) => ({ ...c, gitName: event.target.value }))}
            onBlur={commit("gitName", "the name on its commits")}
          />
        </Field>
      )}

      <Separator />

      {agents.length > 1 && (
        <Field>
          <FieldLabel>May hand a ticket to</FieldLabel>
          <FieldDescription className="text-xs">
            It can pass work to nobody else unless you pick someone.
          </FieldDescription>
          <div className="flex flex-wrap gap-1.5">
            {agents
              .filter((other) => other.id !== agent.id)
              .map((other) => {
                const on = agent.handoffTo.includes(other.handle);
                return (
                  <Button
                    key={other.id}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    onClick={() =>
                      void save(
                        {
                          handoffTo: on
                            ? agent.handoffTo.filter((handle) => handle !== other.handle)
                            : [...agent.handoffTo, other.handle],
                        },
                        "who it may hand a ticket to",
                      )
                    }
                  >
                    @{other.handle}
                  </Button>
                );
              })}
          </div>
        </Field>
      )}

      <Field orientation="horizontal" className="items-center">
        <FieldContent>
          <FieldLabel htmlFor="agent-autostart">Start unattended</FieldLabel>
          <FieldDescription className="text-xs">
            Lets the board run this agent when a ticket reaches Todo.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="agent-autostart"
          checked={agent.autoStart}
          onCheckedChange={(next) => void save({ autoStart: next }, "whether it starts unattended")}
        />
      </Field>
    </div>
  );
}
