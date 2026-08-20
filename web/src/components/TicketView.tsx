import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Link2, Link2Off, MessagesSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EditableName } from "@/components/EditableName";
import { Markdown } from "@/components/Markdown";
import { PaneHeader } from "@/components/PaneHeader";
import { apiError } from "@/lib/api-error";
import {
  DERIVED_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TICKET_STATUSES,
} from "@/lib/tickets";
import { tintOf } from "@/lib/tints";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { Ticket, TicketActivity, TicketStatus } from "@/state/types";

/// One ticket: what it is, who has it, and every thread that has worked on it.
///
/// The activity feed below is the log the board is built from rather than a
/// summary of it, so it cannot say something different from what happened.

export function TicketView({
  ticket,
  onBack,
  onOpenThread,
}: {
  ticket: Ticket;
  onBack: () => void;
  onOpenThread: (chatId: string) => void;
}) {
  const projects = useStore((s) => s.projects);
  const agents = useStore((s) => s.agents);
  const chats = useStore((s) => s.chats);
  const updateTicket = useStore((s) => s.updateTicket);
  const moveTicket = useStore((s) => s.moveTicket);
  const commentOnTicket = useStore((s) => s.commentOnTicket);
  const detachThread = useStore((s) => s.detachThread);
  const readActivity = useStore((s) => s.ticketActivity);

  const [activity, setActivity] = useState<TicketActivity[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [draft, setDraft] = useState(ticket.body);

  const project = projects.find((entry) => entry.id === ticket.projectId);

  const refreshActivity = useCallback(() => {
    void readActivity(ticket.id)
      .then(setActivity)
      .catch(() => {
        // The feed is a read of the same events the pane already shows; a
        // failure here is not worth interrupting the ticket for.
      });
  }, [readActivity, ticket.id]);

  useEffect(refreshActivity, [refreshActivity, ticket.updatedAt]);
  useEffect(() => setDraft(ticket.body), [ticket.body, ticket.id]);

  const save = async (patch: Record<string, unknown>, what: string) => {
    try {
      await updateTicket(ticket.id, patch);
    } catch (error) {
      toast.error(`Couldn't save ${what}`, { description: apiError(error) });
    }
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PaneHeader
        crumbs={[
          { label: "Board", onClick: onBack },
          ...(project ? [{ label: project.name, onClick: onBack }] : []),
          { label: ticket.key },
        ]}
      >
        <Select
          value={ticket.status}
          onValueChange={(value) => void moveTicket(ticket.id, value as TicketStatus)}
        >
          <SelectTrigger size="sm" className="w-40 shrink-0" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {TICKET_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  <span className={cn("size-2 rounded-full", STATUS_TONE[status])} />
                  {STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </PaneHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6">
          <div className="flex flex-col gap-2">
            <h1>
              <EditableName
                value={ticket.title}
                label="ticket title"
                className="text-xl leading-tight font-semibold"
                onCommit={(title) => void save({ title }, "the title")}
              />
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{ticket.key}</span>
              {ticket.branch && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{ticket.branch}</span>
                </>
              )}
              {DERIVED_STATUSES.includes(ticket.status) && ticket.threads.length > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default underline decoration-dotted">follows its thread</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Remy moves this between In progress and Needs input. Any other status is yours.
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field orientation="horizontal" className="items-center">
              <FieldContent>
                <FieldLabel htmlFor="ticket-assignee">Assignee</FieldLabel>
              </FieldContent>
              <Select
                value={ticket.assigneeAgentId ?? "none"}
                onValueChange={(value) =>
                  void save({ assigneeAgentId: value === "none" ? "" : value }, "the assignee")
                }
              >
                <SelectTrigger id="ticket-assignee" size="sm" className="w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    <SelectItem value="none">Nobody</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <span className={cn("size-2 rounded-full", tintOf(agent.tint).swatch)} />
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="horizontal" className="items-center">
              <FieldContent>
                <FieldLabel htmlFor="ticket-priority">Priority</FieldLabel>
              </FieldContent>
              <Select
                value={String(ticket.priority)}
                onValueChange={(value) => void save({ priority: Number(value) }, "the priority")}
              >
                <SelectTrigger id="ticket-priority" size="sm" className="w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    {PRIORITY_LABEL.map((label, value) => (
                      <SelectItem key={label} value={String(value)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Separator />

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Description</h2>
            {editingBody ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  autoFocus
                  rows={8}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="What has to change, and how you will know it worked."
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingBody(false);
                      void save({ body: draft }, "the description");
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraft(ticket.body);
                      setEditingBody(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEditingBody(true)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  setEditingBody(true);
                }}
                className="cursor-text rounded-lg border border-transparent px-3 py-2 hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {ticket.body ? (
                  <Markdown text={ticket.body} />
                ) : (
                  <p className="text-sm text-muted-foreground">Add a description.</p>
                )}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Threads</h2>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAttaching(true)}>
                <Link2 />
                Attach a thread
              </Button>
            </div>
            {ticket.threads.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No thread has worked on this yet.
              </p>
            ) : (
              <ItemGroup className="gap-1.5">
                {ticket.threads.map((link) => {
                  const chat = chats.find((entry) => entry.id === link.chatId);
                  const agent = agents.find((entry) => entry.id === link.agentId);
                  return (
                    <Item key={link.chatId} variant="outline" size="sm">
                      <ItemMedia>
                        <MessagesSquare className="size-4 text-muted-foreground" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle className="truncate">{chat?.title ?? "A thread on another machine"}</ItemTitle>
                        <ItemDescription>
                          {agent ? `${agent.name} · ` : ""}
                          {link.linkedBy === "runner" ? "started by the board" : "attached by you"}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        {chat && chat.state !== "idle" && (
                          <Badge variant={chat.state === "needs_input" ? "warning" : "info"}>
                            {chat.state === "needs_input" ? "Needs you" : "Working"}
                          </Badge>
                        )}
                        {chat && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Open thread"
                                onClick={() => onOpenThread(link.chatId)}
                              >
                                <ArrowUpRight />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open thread</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Detach thread"
                              onClick={() => void detachThread(ticket.id, link.chatId)}
                            >
                              <Link2Off />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Detach thread</TooltipContent>
                        </Tooltip>
                      </ItemActions>
                    </Item>
                  );
                })}
              </ItemGroup>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Activity</h2>
            <ActivityFeed activity={activity} />
            <CommentBox
              onSend={async (body) => {
                try {
                  await commentOnTicket(ticket.id, body);
                  refreshActivity();
                } catch (error) {
                  toast.error("Couldn't add that comment", { description: apiError(error) });
                }
              }}
            />
          </section>
        </div>
      </ScrollArea>

      <AttachThreadDialog
        open={attaching}
        onOpenChange={setAttaching}
        ticket={ticket}
        onAttached={refreshActivity}
      />
    </main>
  );
}

function ActivityFeed({ activity }: { activity: TicketActivity[] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-2.5">
      {activity.map((entry) => (
        <li key={entry.id} className="flex gap-2.5 text-sm">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-muted-foreground">
              <span className="text-foreground">{actorName(entry.actor)}</span> {describe(entry)}
              <span className="ml-2 text-[11px]">{when(entry.at)}</span>
            </span>
            {entry.kind === "comment" && entry.body && (
              <div className="rounded-lg border border-border bg-card px-3 py-2">
                <Markdown text={entry.body} />
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function actorName(actor: string): string {
  if (actor === "you") return "You";
  if (actor === "remy") return "Remy";
  return actor;
}

function describe(entry: TicketActivity): string {
  const status = typeof entry.detail?.status === "string" ? entry.detail.status : undefined;
  if (entry.kind === "create") return "created this ticket";
  if (entry.kind === "comment") return "commented";
  if (entry.kind === "link") return "attached a thread";
  if (entry.kind === "unlink") return "detached a thread";
  if (entry.kind === "handoff") return "handed this on";
  if (entry.kind === "status" && status) {
    return `moved this to ${STATUS_LABEL[status as TicketStatus] ?? status}`;
  }
  return "changed this ticket";
}

function when(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(at).toLocaleDateString();
}

function CommentBox({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const body = value.trim();
    if (!body) return;
    setSending(true);
    try {
      await onSend(body);
      setValue("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        rows={3}
        value={value}
        placeholder="Leave a note for whoever picks this up."
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter is a newline, the same as the composer.
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          void send();
        }}
      />
      <Button size="sm" className="self-end" disabled={!value.trim() || sending} onClick={() => void send()}>
        <Send />
        Comment
      </Button>
    </div>
  );
}

/// Attaching a thread that already exists. Deliberately does not start or
/// resume it — this is bookkeeping, and the thread carries on as it was.
function AttachThreadDialog({
  open,
  onOpenChange,
  ticket,
  onAttached,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
  onAttached: () => void;
}) {
  const chats = useStore((s) => s.chats);
  const tickets = useStore((s) => s.tickets);
  const attachThread = useStore((s) => s.attachThread);

  // A thread belongs to one ticket at a time, so the ones already spoken for
  // are not offered rather than offered and refused.
  const taken = new Set(tickets.flatMap((entry) => entry.threads.map((link) => link.chatId)));
  const available = chats.filter((chat) => !taken.has(chat.id));

  const attach = async (chatId: string) => {
    try {
      await attachThread(ticket.id, chatId);
      onOpenChange(false);
      onAttached();
    } catch (error) {
      toast.error("Couldn't attach that thread", { description: apiError(error) });
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Attach a thread">
      <Command>
        <CommandInput placeholder="Find a thread…" />
        <CommandList>
          <CommandEmpty>
            {chats.length === 0 ? "No threads on this machine yet." : "Every thread is already on a ticket."}
          </CommandEmpty>
          {available.map((chat) => (
            <CommandItem key={chat.id} value={`${chat.title} ${chat.cwd}`} onSelect={() => void attach(chat.id)}>
              <MessagesSquare />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{chat.title}</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">{chat.cwd}</span>
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/// Shown when a route names a ticket that is not here — a stale link, or one
/// from a machine this device cannot reach.
export function MissingTicket({ ticketKey, onBack }: { ticketKey: string; onBack: () => void }) {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PaneHeader crumbs={[{ label: "Board", onClick: onBack }, { label: ticketKey }]} />
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessagesSquare />
          </EmptyMedia>
          <EmptyTitle>No ticket called {ticketKey}</EmptyTitle>
          <EmptyDescription>It was deleted, or it lives on a machine you can't reach.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
