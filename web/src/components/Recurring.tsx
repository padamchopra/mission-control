import { useEffect, useMemo, useState } from "react";
import { Folder, MoreHorizontal, Play, Plus, Repeat, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PaneHeader } from "@/components/PaneHeader";
import { AssigneeAvatar } from "@/components/TicketGlyphs";
import { WorkspaceMark } from "@/components/WorkspaceIcon";
import { apiError } from "@/lib/api-error";
import { deviceIcon } from "@/lib/devices";
import { localWorkspace } from "@/lib/projects";
import {
  CADENCES,
  CADENCE_LABEL,
  WEEKDAYS,
  WORKSPACE_AGENT,
  cadenceSummary,
  clockTime,
  people,
  whenNext,
} from "@/lib/tickets";
import { useStore } from "@/state/store";
import type { Agent, Cadence, Project, Recurrence, Workspace } from "@/state/types";

/// Work that comes back.
///
/// A recurring ticket is a ticket, not a scheduled prompt: it lands on the board
/// in Todo, already handed to whoever is meant to do it. So this pane is a list
/// of what is coming and who has it, and everything else about it happens on the
/// board like any other ticket.

export function Recurring({
  onOpenTicket,
  onOpenWorkspace,
  onAddWorkspace,
}: {
  onOpenTicket: (key: string) => void;
  onOpenWorkspace: (workspaceId: string) => void;
  onAddWorkspace: () => void;
}) {
  const projects = useStore((s) => s.projects);
  const recurring = useStore((s) => s.recurring);
  const agents = useStore((s) => s.agents);
  const workspaces = useStore((s) => s.workspaces);
  const loading = useStore((s) => s.boardLoading);
  const loadBoard = useStore((s) => s.loadBoard);
  const [editing, setEditing] = useState<Recurrence | undefined>();
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    void loadBoard().catch(() => {
      // An unreachable machine already says so in the device badge.
    });
  }, [loadBoard]);

  if (projects.length === 0) {
    return (
      <main className="flex min-w-0 flex-1 flex-col">
        <PaneHeader crumbs={[{ label: "Recurring" }]} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Repeat />
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
      <PaneHeader crumbs={[{ label: "Recurring" }]}>
        <span className="text-xs text-muted-foreground tabular-nums">
          {recurring.length} ticket{recurring.length === 1 ? "" : "s"}
        </span>
        <Button size="sm" onClick={() => setWriting(true)}>
          <Plus />
          New recurring ticket
        </Button>
      </PaneHeader>

      {recurring.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Repeat />
            </EmptyMedia>
            <EmptyTitle>Nothing comes back yet</EmptyTitle>
            <EmptyDescription>
              Write a ticket Remy hands out again every day, week or month.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setWriting(true)}>
              <Plus />
              New recurring ticket
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ItemGroup className="gap-2 p-4">
            {recurring.map((recurrence) => (
              <RecurrenceRow
                key={recurrence.id}
                recurrence={recurrence}
                project={projects.find((entry) => entry.id === recurrence.projectId)}
                workspaces={workspaces}
                agents={agents}
                onEdit={() => setEditing(recurrence)}
                onOpenTicket={onOpenTicket}
                onOpenWorkspace={onOpenWorkspace}
              />
            ))}
          </ItemGroup>
        </ScrollArea>
      )}

      <RecurrenceDialog
        open={writing || Boolean(editing)}
        onOpenChange={(next) => {
          if (next) return;
          setWriting(false);
          setEditing(undefined);
        }}
        recurrence={editing}
        projects={projects}
        agents={agents}
      />
    </main>
  );
}

function RecurrenceRow({
  recurrence,
  project,
  workspaces,
  agents,
  onEdit,
  onOpenTicket,
  onOpenWorkspace,
}: {
  recurrence: Recurrence;
  project?: Project;
  workspaces: Workspace[];
  agents: Agent[];
  onEdit: () => void;
  onOpenTicket: (key: string) => void;
  onOpenWorkspace: (workspaceId: string) => void;
}) {
  const servers = useStore((s) => s.servers);
  const boardDevices = useStore((s) => s.boardDevices);
  const saveRecurrence = useStore((s) => s.saveRecurrence);
  const deleteRecurrence = useStore((s) => s.deleteRecurrence);
  const runRecurrence = useStore((s) => s.runRecurrence);

  const workspace = project ? localWorkspace(project, workspaces) : undefined;
  const device = servers.find(
    (server) => server.id === boardDevices.find((entry) => entry.deviceId === recurrence.deviceId)?.serverId,
  );
  const DeviceIcon = deviceIcon(device?.icon);

  const pause = async (enabled: boolean) => {
    try {
      await saveRecurrence(recurrence.id, { enabled });
    } catch (error) {
      toast.error("Couldn't change that", { description: apiError(error) });
    }
  };

  const write = async () => {
    try {
      const ticket = await runRecurrence(recurrence.id);
      onOpenTicket(ticket.key);
    } catch (error) {
      toast.error("Couldn't write that ticket", { description: apiError(error) });
    }
  };

  const remove = async () => {
    try {
      await deleteRecurrence(recurrence.id);
      toast.success(`${recurrence.title} won't come back`);
    } catch (error) {
      toast.error("Couldn't delete that", { description: apiError(error) });
    }
  };

  return (
    <Item variant="outline">
      <ItemMedia>
        <AssigneeAvatar assignee={recurrence.assigneeAgentId} agents={agents} size="md" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{recurrence.title}</ItemTitle>
        <ItemDescription>
          {cadenceSummary(recurrence)}
          {recurrence.enabled ? ` · next ${whenNext(recurrence.nextRunAt)}` : " · paused"}
          {recurrence.runs > 0 && ` · ${recurrence.runs} written`}
        </ItemDescription>
        <ItemDescription className="flex items-center gap-1.5">
          {workspace ? (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => onOpenWorkspace(workspace.id)}
            >
              <WorkspaceMark home={false} workspace={workspace} size="sm" />
              {workspace.name}
            </button>
          ) : (
            // The repo is on some machine; this one just has not cloned it, so
            // there is nothing here to open.
            <span className="flex items-center gap-1.5">
              <Folder className="size-4 shrink-0" />
              {project?.name ?? "No project"}
            </span>
          )}
          {device && (
            <span className="flex items-center gap-1">
              <span aria-hidden>·</span>
              <DeviceIcon className="size-3 shrink-0" />
              {device.name}
            </span>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {recurrence.lastError && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="destructive">Last one failed</Badge>
            </TooltipTrigger>
            <TooltipContent>{recurrence.lastError}</TooltipContent>
          </Tooltip>
        )}
        {/* Deliberately not inside a Tooltip: a trigger `asChild` writes its
            own `data-state` onto the control it wraps, which is the attribute
            the switch colours itself by — so a tooltip here would leave every
            switch drawn as though it were off. The label says what it does. */}
        <Switch
          checked={recurrence.enabled}
          aria-label={`Write ${recurrence.title} on schedule`}
          onCheckedChange={(next) => void pause(next)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${recurrence.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void write()}>
              <Play />
              Write a ticket now
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>
              <SquarePen />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
}

/// Writing one, and editing one. The same dialog for both: a recurrence is a
/// title, a cadence and an assignee, which is a form rather than a pane.
function RecurrenceDialog({
  open,
  onOpenChange,
  recurrence,
  projects,
  agents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Absent when writing a new one.
  recurrence?: Recurrence;
  projects: Project[];
  agents: Agent[];
}) {
  const saveRecurrence = useStore((s) => s.saveRecurrence);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [project, setProject] = useState("");
  const [assignee, setAssignee] = useState("none");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [weekday, setWeekday] = useState(1);
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  // The dialog is one component for both jobs, so opening it is what loads the
  // recurrence being edited — or clears the fields for a new one.
  useEffect(() => {
    if (!open) return;
    setTitle(recurrence?.title ?? "");
    setBody(recurrence?.body ?? "");
    setProject(recurrence?.projectId ?? projects[0]?.id ?? "");
    setAssignee(recurrence?.assigneeAgentId ?? "none");
    setCadence(recurrence?.cadence ?? "weekly");
    setWeekday(recurrence?.weekday ?? 1);
    setDay(recurrence?.day ?? 1);
    setTime(
      `${String(recurrence?.hour ?? 9).padStart(2, "0")}:${String(recurrence?.minute ?? 0).padStart(2, "0")}`,
    );
  }, [open, recurrence, projects]);

  const roster = useMemo(() => people(agents), [agents]);
  const [hour, minute] = useMemo(() => {
    const [rawHour, rawMinute] = time.split(":");
    return [Number(rawHour) || 0, Number(rawMinute) || 0];
  }, [time]);

  const submit = async () => {
    if (!title.trim() || !project) return;
    setSaving(true);
    try {
      await saveRecurrence(recurrence?.id, {
        projectId: project,
        title: title.trim(),
        body,
        assigneeAgentId: assignee === "none" ? "" : assignee,
        cadence,
        hour,
        minute,
        weekday,
        day,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error("Couldn't save that recurring ticket", { description: apiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{recurrence ? "Edit recurring ticket" : "New recurring ticket"}</DialogTitle>
          <DialogDescription>
            Remy writes this ticket on the cadence you pick, already assigned.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="recurring-title">Title</FieldLabel>
            <Input
              id="recurring-title"
              autoFocus
              value={title}
              placeholder="Triage the backlog"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void submit();
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="recurring-body">Description</FieldLabel>
            <Textarea
              id="recurring-body"
              rows={4}
              value={body}
              placeholder="What has to happen each time, and how you will know it worked."
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>

          <Field orientation="horizontal" className="items-center">
            <FieldContent>
              <FieldLabel htmlFor="recurring-assignee">Assignee</FieldLabel>
              <FieldDescription className="text-xs">
                {assignee === WORKSPACE_AGENT
                  ? "The workspace's own default model, with no agent in front of it."
                  : "Who each ticket is handed to."}
              </FieldDescription>
            </FieldContent>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="recurring-assignee" size="sm" className="w-52 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  <SelectItem value="none">
                    {/* An avatar slot of its own, so every name starts in the
                        same column. */}
                    <AssigneeAvatar agents={agents} />
                    Nobody
                  </SelectItem>
                  {roster.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      <AssigneeAvatar assignee={person.id} agents={agents} />
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal" className="items-center">
            <FieldContent>
              <FieldLabel htmlFor="recurring-cadence">How often</FieldLabel>
              <FieldDescription className="text-xs">
                {cadenceSummary({ cadence, hour, minute, weekday, day })}, on the machine that holds it.
              </FieldDescription>
            </FieldContent>
            <Select value={cadence} onValueChange={(next) => setCadence(next as Cadence)}>
              <SelectTrigger id="recurring-cadence" size="sm" className="w-52 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {CADENCES.map((option) => (
                    <SelectItem key={option} value={option}>
                      <Repeat />
                      {CADENCE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          {cadence === "weekly" && (
            <Field orientation="horizontal" className="items-center">
              <FieldContent>
                <FieldLabel htmlFor="recurring-weekday">Day of the week</FieldLabel>
              </FieldContent>
              <Select value={String(weekday)} onValueChange={(next) => setWeekday(Number(next))}>
                <SelectTrigger id="recurring-weekday" size="sm" className="w-52 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    {WEEKDAYS.map((name, index) => (
                      <SelectItem key={name} value={String(index)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}

          {cadence === "monthly" && (
            <Field orientation="horizontal" className="items-center">
              <FieldContent>
                <FieldLabel htmlFor="recurring-day">Day of the month</FieldLabel>
                <FieldDescription className="text-xs">
                  The 28th at the latest, so February has one too.
                </FieldDescription>
              </FieldContent>
              <Select value={String(day)} onValueChange={(next) => setDay(Number(next))}>
                <SelectTrigger id="recurring-day" size="sm" className="w-52 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field orientation="horizontal" className="items-center">
            <FieldContent>
              <FieldLabel htmlFor="recurring-time">Time</FieldLabel>
              <FieldDescription className="text-xs">
                {clockTime(hour, minute)} where the work runs.
              </FieldDescription>
            </FieldContent>
            <Input
              id="recurring-time"
              type="time"
              className="w-52 shrink-0"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </Field>

          {projects.length > 1 && !recurrence && (
            <Field orientation="horizontal" className="items-center">
              <FieldContent>
                <FieldLabel htmlFor="recurring-project">Project</FieldLabel>
              </FieldContent>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger id="recurring-project" size="sm" className="w-52 shrink-0">
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
            {recurrence ? "Save" : "Create recurring ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
