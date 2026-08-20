import { useEffect, useState } from "react";
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
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EditableName } from "@/components/EditableName";
import { IconPicker } from "@/components/IconPicker";
import { WorkspaceFileIcon } from "@/components/WorkspaceIcon";
import { apiError } from "@/lib/api-error";
import { deviceIcon } from "@/lib/devices";
import { displayPath } from "@/lib/path";
import { PROJECT_ICON_IDS, isProjectIcon, isProjectIconFile, projectIcon } from "@/lib/projects";
import { tintOf } from "@/lib/tints";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PaneHeader } from "@/components/PaneHeader";
import { useStore } from "@/state/store";
import type { Server, Workspace } from "@/state/types";

/// The letters in front of this workspace's ticket keys.
///
/// Changing it re-keys every ticket the workspace already has, because a key is
/// the ticket's number behind this slug rather than a string written down when
/// the ticket was made.
function TicketSlugField({ workspace }: { workspace: Workspace }) {
  const projects = useStore((s) => s.projects);
  const loadBoard = useStore((s) => s.loadBoard);
  const saveProject = useStore((s) => s.saveProject);
  const tickets = useStore((s) => s.tickets);

  useEffect(() => {
    void loadBoard().catch(() => {
      // The board is a nicety on this pane; the rest of it works without one.
    });
  }, [loadBoard]);

  const project = projects.find((entry) => entry.workspaceIds.includes(workspace.id));
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(project?.keyPrefix ?? ""), [project?.keyPrefix]);

  if (!project) return null;
  const count = tickets.filter((ticket) => ticket.projectId === project.id).length;

  const commit = () => {
    const next = draft.trim().toUpperCase();
    if (!next || next === project.keyPrefix) {
      setDraft(project.keyPrefix);
      return;
    }
    void saveProject(project.id, { keyPrefix: next }).catch((error) => {
      setDraft(project.keyPrefix);
      toast.error("Couldn't change the slug", { description: apiError(error) });
    });
  };

  return (
    <Field orientation="horizontal" className="items-center">
      <FieldContent>
        <FieldLabel htmlFor="ticket-slug">Ticket slug</FieldLabel>
        <FieldDescription className="text-xs">
          {count > 0
            ? `In front of every ticket here. Changing it re-keys all ${count}.`
            : "In front of every ticket here."}
        </FieldDescription>
      </FieldContent>
      <Input
        id="ticket-slug"
        value={draft}
        maxLength={6}
        aria-label="Ticket slug"
        className="w-28 shrink-0 text-center font-mono uppercase"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(project.keyPrefix);
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

export function devicesForWorkspace(workspace: Workspace, all: Workspace[], servers: Server[]): Server[] {
  const related = all.filter((entry) =>
    entry.id === workspace.id
    || (workspace.origin ? entry.origin === workspace.origin : false),
  );
  const ids = [...new Set(related.map((entry) => entry.serverId))];
  return ids.flatMap((id) => {
    const server = servers.find((entry) => entry.id === id);
    return server ? [server] : [];
  });
}

export function WorkspaceSettings({
  workspace,
  onBack,
}: {
  workspace: Workspace;
  onBack: () => void;
}) {
  const servers = useStore((s) => s.servers);
  const allWorkspaces = useStore((s) => s.workspaces);
  const updateWorkspace = useStore((s) => s.updateWorkspace);
  const removeWorkspace = useStore((s) => s.removeWorkspace);
  const devices = devicesForWorkspace(workspace, allWorkspaces, servers);

  const remove = async () => {
    await removeWorkspace(workspace.id);
    toast.success(`Removed ${workspace.name}.`);
    onBack();
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PaneHeader
        crumbs={[
          { label: "Workspaces", onClick: onBack },
          { label: workspace.name },
        ]}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
            <IconPicker
              label={`Change icon for ${workspace.name}`}
              icon={isProjectIcon(workspace.icon) ? workspace.icon : "folder"}
              tint={workspace.tint}
              icons={PROJECT_ICON_IDS}
              renderIcon={projectIcon}
              preview={
                isProjectIconFile(workspace.icon) ? (
                  <WorkspaceFileIcon workspaceId={workspace.id} path={workspace.icon} className="size-6" />
                ) : undefined
              }
              files={{
                workspaceId: workspace.id,
                onPick: (path) => void updateWorkspace(workspace.id, { icon: path }),
              }}
              onChange={(patch) => void updateWorkspace(workspace.id, patch)}
            />
            <div className="min-w-0 flex-1">
              <EditableName
                value={workspace.name}
                label="workspace name"
                onCommit={(name) => void updateWorkspace(workspace.id, { name })}
              />
              <p className="truncate font-mono text-xs text-muted-foreground">{displayPath(workspace.path)}</p>
            </div>
          </div>

          <TicketSlugField workspace={workspace} />

          <div className="flex flex-col gap-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">Devices</p>
            {devices.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">
                This workspace isn't on a connected device.
              </p>
            ) : (
              devices.map((server) => {
                const DeviceIcon = deviceIcon(server.icon);
                const colors = tintOf(server.tint);
                const copy = allWorkspaces.find(
                  (entry) =>
                    entry.serverId === server.id
                    && (entry.id === workspace.id || (workspace.origin && entry.origin === workspace.origin)),
                );
                return (
                  <div
                    key={server.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3"
                  >
                    <span
                      className={cn(
                        "relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-border",
                        colors.well,
                        colors.fg,
                      )}
                    >
                      <DeviceIcon className="size-4" />
                      <span
                        className={cn(
                          "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card",
                          server.online ? "bg-success" : "bg-muted-foreground",
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{server.name}</span>
                        <Badge variant={server.online ? "success" : "secondary"}>
                          {server.online ? "Connected" : "Offline"}
                        </Badge>
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {copy ? displayPath(copy.path) : "Not on this machine"}
                      </span>
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Remove workspace</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {workspace.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Chats in this folder stay on disk. Remy stops listing the workspace.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void remove()}>
                    Remove workspace
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </ScrollArea>
    </main>
  );
}
