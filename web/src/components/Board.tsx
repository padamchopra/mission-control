import { useEffect, useMemo, useState } from "react";
import { ChevronRight, KanbanSquare, MoreHorizontal, Plus, SquareKanban } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PaneHeader } from "@/components/PaneHeader";
import { apiError } from "@/lib/api-error";
import {
  BOARD_COLUMNS,
  STATUS_LABEL,
  STATUS_TONE,
  TICKET_STATUSES,
  agentFor,
  currentThread,
  neighboursAt,
  ticketsInColumn,
} from "@/lib/tickets";
import { tintOf } from "@/lib/tints";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { Agent, Chat, Project, Ticket, TicketStatus } from "@/state/types";

/// The board: one column per status, cards in rank order.
///
/// Cards move by menu rather than by drag. Every move is reachable from the
/// keyboard that way, and it is the same code path a drag would call — so
/// adding drag later changes how a move is started, not what a move is.

export function Board({
  projectId,
  onOpenTicket,
  onAddWorkspace,
}: {
  projectId?: string;
  onOpenTicket: (key: string) => void;
  onAddWorkspace: () => void;
}) {
  const projects = useStore((s) => s.projects);
  const tickets = useStore((s) => s.tickets);
  const agents = useStore((s) => s.agents);
  const chats = useStore((s) => s.chats);
  const loading = useStore((s) => s.boardLoading);
  const loadBoard = useStore((s) => s.loadBoard);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    void loadBoard().catch(() => {
      // An unreachable machine already says so in the device badge.
    });
  }, [loadBoard]);

  const project = projects.find((entry) => entry.id === projectId) ?? projects[0];
  const scoped = useMemo(
    () => (project ? tickets.filter((ticket) => ticket.projectId === project.id) : []),
    [tickets, project],
  );

  const crumbs = [
    { label: "Board" },
    ...(project ? [{ label: <ProjectPicker projects={projects} project={project} /> }] : []),
  ];

  if (projects.length === 0) {
    return (
      <main className="flex min-w-0 flex-1 flex-col">
        <PaneHeader crumbs={[{ label: "Board" }]} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SquareKanban />
            </EmptyMedia>
            <EmptyTitle className={loading ? "shimmer" : undefined}>
              {loading ? "Reading the board…" : "No projects yet"}
            </EmptyTitle>
            <EmptyDescription>
              {loading ? "Asking this machine what it is tracking." : "Add a workspace to plan work in it."}
            </EmptyDescription>
          </EmptyHeader>
          {!loading && (
            <EmptyContent>
              <Button onClick={onAddWorkspace}>
                <Plus />
                Add workspace
              </Button>
            </EmptyContent>
          )}
        </Empty>
      </main>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PaneHeader crumbs={crumbs}>
        <span className="text-xs text-muted-foreground">
          {scoped.length} ticket{scoped.length === 1 ? "" : "s"}
        </span>
        <Button size="sm" onClick={() => setComposing(true)}>
          <Plus />
          New ticket
        </Button>
      </PaneHeader>

      {scoped.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KanbanSquare />
            </EmptyMedia>
            <EmptyTitle>Nothing on the board</EmptyTitle>
            <EmptyDescription>Write the first ticket for {project?.name}.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setComposing(true)}>
              <Plus />
              New ticket
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1" orientation="both">
          <div className="flex min-h-full items-start gap-3 p-4">
            {BOARD_COLUMNS.map((status) => (
              <Column
                key={status}
                status={status}
                tickets={ticketsInColumn(scoped, status)}
                allTickets={scoped}
                agents={agents}
                chats={chats}
                onOpenTicket={onOpenTicket}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <NewTicketDialog
        open={composing}
        onOpenChange={setComposing}
        projects={projects}
        projectId={project?.id}
        onCreated={onOpenTicket}
      />
    </main>
  );
}

function ProjectPicker({ projects, project }: { projects: Project[]; project: Project }) {
  const navigate = (id: string) => {
    window.location.hash = `#/board/${encodeURIComponent(id)}`;
  };
  if (projects.length === 1) return <span className="font-semibold">{project.name}</span>;
  return (
    <Select value={project.id} onValueChange={navigate}>
      <SelectTrigger size="sm" className="h-auto border-none px-1 font-semibold shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {projects.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function Column({
  status,
  tickets,
  allTickets,
  agents,
  chats,
  onOpenTicket,
}: {
  status: TicketStatus;
  tickets: Ticket[];
  allTickets: Ticket[];
  agents: Agent[];
  chats: Chat[];
  onOpenTicket: (key: string) => void;
}) {
  return (
    <section
      className="flex w-72 shrink-0 flex-col gap-2"
      aria-label={STATUS_LABEL[status]}
      data-status={status}
    >
      <header className="flex items-center gap-2 px-1">
        <span className={cn("size-2 shrink-0 rounded-full", STATUS_TONE[status])} />
        <h2 className="text-sm font-medium">{STATUS_LABEL[status]}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{tickets.length}</span>
      </header>
      <div className="flex flex-col gap-2">
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            allTickets={allTickets}
            agent={agentFor(agents, ticket)}
            thread={currentThread(chats, ticket)}
            onOpen={() => onOpenTicket(ticket.key)}
          />
        ))}
      </div>
    </section>
  );
}

function TicketCard({
  ticket,
  allTickets,
  agent,
  thread,
  onOpen,
}: {
  ticket: Ticket;
  allTickets: Ticket[];
  agent?: Agent;
  thread?: Chat;
  onOpen: () => void;
}) {
  const moveTicket = useStore((s) => s.moveTicket);
  const deleteTicket = useStore((s) => s.deleteTicket);

  const move = async (next: TicketStatus) => {
    if (next === ticket.status) return;
    // Landing at the top of the target column is what a person means by "move
    // this to In progress" — they are not choosing a position, they are
    // choosing a column.
    const { before, after } = neighboursAt(allTickets, next, 0, ticket.id);
    try {
      await moveTicket(ticket.id, next, before, after);
    } catch (error) {
      toast.error("Couldn't move that ticket", { description: apiError(error) });
    }
  };

  const remove = async () => {
    try {
      await deleteTicket(ticket.id);
      toast.success(`${ticket.key} deleted`);
    } catch (error) {
      toast.error("Couldn't delete that ticket", { description: apiError(error) });
    }
  };

  const colors = tintOf(agent?.tint);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onOpen();
          }}
          className="group flex cursor-pointer flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{ticket.key}</span>
            {thread && thread.state !== "idle" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      thread.state === "needs_input" && "bg-warning",
                      thread.state === "working" && "bg-info",
                      thread.state === "error" && "bg-destructive",
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {thread.state === "needs_input" ? "Its thread needs you" : "Its thread is working"}
                </TooltipContent>
              </Tooltip>
            )}
            <span className="ml-auto flex items-center gap-1">
              {ticket.priority > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  P{ticket.priority}
                </Badge>
              )}
              <CardMenu status={ticket.status} onMove={move} onOpen={onOpen} onDelete={remove} />
            </span>
          </div>
          <p className="line-clamp-3 text-sm leading-snug">{ticket.title}</p>
          {(agent || ticket.threads.length > 0) && (
            <div className="flex items-center gap-2 pt-0.5">
              {agent && (
                <span className={cn("flex items-center gap-1 text-[11px]", colors.fg)}>
                  <span className={cn("size-1.5 rounded-full", colors.swatch)} />
                  {agent.name}
                </span>
              )}
              {ticket.threads.length > 0 && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {ticket.threads.length} thread{ticket.threads.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>Open ticket</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {TICKET_STATUSES.filter((status) => status !== ticket.status).map((status) => (
              <ContextMenuItem key={status} onSelect={() => void move(status)}>
                <span className={cn("size-2 rounded-full", STATUS_TONE[status])} />
                {STATUS_LABEL[status]}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => void remove()}>
          Delete ticket
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/// The same moves the right-click menu offers, on a button — so a card can be
/// moved from the keyboard without knowing that a context menu is there.
function CardMenu({
  status,
  onMove,
  onOpen,
  onDelete,
}: {
  status: TicketStatus;
  onMove: (next: TicketStatus) => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Ticket actions"
          className="size-5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={onOpen}>Open ticket</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Move to
            <ChevronRight className="ml-auto" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {TICKET_STATUSES.filter((entry) => entry !== status).map((entry) => (
              <DropdownMenuItem key={entry} onSelect={() => onMove(entry)}>
                <span className={cn("size-2 rounded-full", STATUS_TONE[entry])} />
                {STATUS_LABEL[entry]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Delete ticket
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NewTicketDialog({
  open,
  onOpenChange,
  projects,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  projectId?: string;
  onCreated: (key: string) => void;
}) {
  const createTicket = useStore((s) => s.createTicket);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [project, setProject] = useState(projectId ?? projects[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setProject(projectId ?? projects[0]?.id ?? "");
  }, [open, projectId, projects]);

  const submit = async () => {
    if (!title.trim() || !project) return;
    setSaving(true);
    try {
      const ticket = await createTicket({ projectId: project, title: title.trim(), body });
      onOpenChange(false);
      onCreated(ticket.key);
    } catch (error) {
      toast.error("Couldn't create that ticket", { description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>Name the work. You can assign it once it exists.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="ticket-title">Title</FieldLabel>
            <Input
              id="ticket-title"
              autoFocus
              value={title}
              placeholder="Flaky login test"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void submit();
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ticket-body">Description</FieldLabel>
            <Textarea
              id="ticket-body"
              rows={5}
              value={body}
              placeholder="What has to change, and how you will know it worked."
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          {projects.length > 1 && (
            <Field orientation="horizontal" className="items-center">
              <FieldContent>
                <FieldLabel htmlFor="ticket-project">Project</FieldLabel>
              </FieldContent>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger id="ticket-project" size="sm" className="w-52 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    {projects.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!title.trim() || !project || saving}>
            Create ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
