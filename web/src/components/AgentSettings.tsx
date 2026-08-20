import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
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
import { apiError } from "@/lib/api-error";
import { TINT_IDS, tintOf } from "@/lib/tints";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { Agent } from "@/state/types";

/// The roster. An agent is a thread template: instructions appended to the
/// Claude Code preset, a model, how much it may do unasked, and the name its
/// commits carry.

const MODELS = [
  { value: "default", label: "Default" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

const PERMISSIONS = [
  { value: "plan", label: "Plan only", detail: "Reads and proposes. Changes nothing." },
  { value: "default", label: "Ask first", detail: "Stops for every edit and command." },
  { value: "acceptEdits", label: "Edit freely", detail: "Writes files without asking." },
  { value: "bypassPermissions", label: "No prompts", detail: "Never stops to ask." },
];

const IDENTITIES = [
  { value: "off", label: "Yours", detail: "Commits look exactly as they do now." },
  { value: "author", label: "Agent authors", detail: "It authors, you commit." },
  { value: "full", label: "Agent both", detail: "It authors and commits." },
];

export function AgentsPane({
  defaultGitIdentity,
  onSaveDefaultIdentity,
}: {
  defaultGitIdentity: string;
  onSaveDefaultIdentity: (value: string) => void;
}) {
  const agents = useStore((s) => s.agents);
  const loadBoard = useStore((s) => s.loadBoard);
  const [editing, setEditing] = useState<Agent | "new" | undefined>();

  useEffect(() => {
    void loadBoard().catch(() => {
      // An unreachable machine already says so elsewhere.
    });
  }, [loadBoard]);

  return (
    <div className="flex flex-col gap-5">
      <Field orientation="horizontal" className="items-center">
        <FieldContent>
          <FieldLabel htmlFor="default-git-identity">Commits from agents</FieldLabel>
          <FieldDescription className="text-xs">
            What a new agent signs with. Attribution, not proof.
          </FieldDescription>
        </FieldContent>
        <Select value={defaultGitIdentity} onValueChange={onSaveDefaultIdentity}>
          <SelectTrigger id="default-git-identity" size="sm" className="w-44 shrink-0">
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

      {agents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot />
            </EmptyMedia>
            <EmptyTitle>No agents yet</EmptyTitle>
            <EmptyDescription>Write one, and a thread can run as it.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setEditing("new")}>
              <Plus />
              New agent
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center">
            <h3 className="text-sm font-medium">Agents</h3>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditing("new")}>
              <Plus />
              New agent
            </Button>
          </div>
          <ItemGroup className="gap-1.5">
            {agents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} onEdit={() => setEditing(agent)} />
            ))}
          </ItemGroup>
        </div>
      )}

      <AgentDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        agent={editing === "new" ? undefined : editing}
        open={editing !== undefined}
        defaultGitIdentity={defaultGitIdentity}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
    </div>
  );
}

function AgentRow({ agent, onEdit }: { agent: Agent; onEdit: () => void }) {
  const deleteAgent = useStore((s) => s.deleteAgent);
  const colors = tintOf(agent.tint);

  return (
    <Item variant="outline" size="sm" asChild>
      <div
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onEdit();
        }}
        className="cursor-pointer hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ItemMedia>
          <span
            className={cn("flex size-7 items-center justify-center rounded-lg", colors.well, colors.fg)}
          >
            <Bot className="size-4" />
          </span>
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="gap-2">
            {agent.name}
            <span className="font-mono text-[11px] font-normal text-muted-foreground">@{agent.handle}</span>
          </ItemTitle>
          <ItemDescription>{agent.role || "No role set."}</ItemDescription>
        </ItemContent>
        <ItemActions onClick={(event) => event.stopPropagation()}>
          {agent.gitIdentity !== "off" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {agent.gitEmail}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {agent.gitIdentity === "full" ? "Authors and commits as this" : "Authors as this; you commit"}
              </TooltipContent>
            </Tooltip>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${agent.name}`}>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
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
                    void deleteAgent(agent.id).catch((error) =>
                      toast.error("Couldn't delete that agent", { description: apiError(error) }),
                    )
                  }
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ItemActions>
      </div>
    </Item>
  );
}

function AgentDialog({
  agent,
  open,
  defaultGitIdentity,
  onOpenChange,
}: {
  agent?: Agent;
  open: boolean;
  defaultGitIdentity: string;
  onOpenChange: (open: boolean) => void;
}) {
  const saveAgent = useStore((s) => s.saveAgent);
  const agents = useStore((s) => s.agents);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const value = <T,>(key: string, fallback: T): T =>
    (draft[key] as T) ?? ((agent as unknown as Record<string, T>)?.[key] ?? fallback);

  const set = (key: string, next: unknown) => setDraft((current) => ({ ...current, [key]: next }));

  const submit = async () => {
    setSaving(true);
    try {
      const patch = agent ? draft : { gitIdentity: defaultGitIdentity, ...draft };
      await saveAgent(agent?.id, patch);
      onOpenChange(false);
    } catch (error) {
      toast.error("Couldn't save that agent", { description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  const identity = value<string>("gitIdentity", defaultGitIdentity);
  const tint = value<string>("tint", "zinc");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{agent ? agent.name : "New agent"}</DialogTitle>
          <DialogDescription>
            Its instructions are added to Claude Code's own, not swapped for them.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mx-1 max-h-[60vh] px-1">
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="agent-name">Name</FieldLabel>
                <Input
                  id="agent-name"
                  autoFocus={!agent}
                  value={value("name", "")}
                  placeholder="Builder"
                  onChange={(event) => set("name", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-handle">Handle</FieldLabel>
                <Input
                  id="agent-handle"
                  className="font-mono"
                  value={value("handle", "")}
                  placeholder="builder"
                  onChange={(event) => set("handle", event.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="agent-role">Role</FieldLabel>
              <FieldDescription className="text-xs">One line, shown under the name.</FieldDescription>
              <Input
                id="agent-role"
                value={value("role", "")}
                placeholder="Implements the ticket in its own worktree"
                onChange={(event) => set("role", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="agent-instructions">Instructions</FieldLabel>
              <Textarea
                id="agent-instructions"
                rows={7}
                value={value("instructions", "")}
                placeholder="How this agent works, in the second person."
                onChange={(event) => set("instructions", event.target.value)}
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
                    aria-pressed={tint === id}
                    onClick={() => set("tint", id)}
                    className={cn(
                      "size-6 rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      tintOf(id).swatch,
                      tint === id && "ring-2 ring-primary",
                    )}
                  />
                ))}
              </div>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="agent-model">Model</FieldLabel>
                <Select
                  value={value("model", "") || "default"}
                  onValueChange={(next) => set("model", next === "default" ? "" : next)}
                >
                  <SelectTrigger id="agent-model" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {MODELS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-permission">May do unasked</FieldLabel>
                <Select
                  value={value("permissionMode", "default")}
                  onValueChange={(next) => set("permissionMode", next)}
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

            <Separator />

            <Field>
              <FieldLabel htmlFor="agent-identity">Commits</FieldLabel>
              <FieldDescription className="text-xs">
                {IDENTITIES.find((option) => option.value === identity)?.detail}
              </FieldDescription>
              <Select value={identity} onValueChange={(next) => set("gitIdentity", next)}>
                <SelectTrigger id="agent-identity" size="sm">
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="agent-git-name">Name on commits</FieldLabel>
                  <Input
                    id="agent-git-name"
                    value={value("gitName", "")}
                    placeholder={value("name", "Builder")}
                    onChange={(event) => set("gitName", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="agent-git-email">Email on commits</FieldLabel>
                  <Input
                    id="agent-git-email"
                    className="font-mono text-xs"
                    value={value("gitEmail", "")}
                    placeholder={`${value("handle", "builder")}@remy.invalid`}
                    onChange={(event) => set("gitEmail", event.target.value)}
                  />
                </Field>
              </div>
            )}

            {agents.length > 1 && (
              <Field>
                <FieldLabel>May hand a ticket to</FieldLabel>
                <FieldDescription className="text-xs">
                  It can pass work to nobody else unless you pick someone.
                </FieldDescription>
                <div className="flex flex-wrap gap-1.5">
                  {agents
                    .filter((other) => other.id !== agent?.id)
                    .map((other) => {
                      const list = value<string[]>("handoffTo", []);
                      const on = list.includes(other.handle);
                      return (
                        <Button
                          key={other.id}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          aria-pressed={on}
                          onClick={() =>
                            set(
                              "handoffTo",
                              on ? list.filter((handle) => handle !== other.handle) : [...list, other.handle],
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
                checked={value("autoStart", true)}
                onCheckedChange={(next) => set("autoStart", next)}
              />
            </Field>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !value("name", "")}>
            {agent ? "Save agent" : "Create agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
