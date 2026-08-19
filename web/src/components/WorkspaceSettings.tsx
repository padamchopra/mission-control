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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EditableName } from "@/components/EditableName";
import { IconPicker } from "@/components/IconPicker";
import { WorkspaceFileIcon } from "@/components/WorkspaceIcon";
import { deviceIcon } from "@/lib/devices";
import { displayPath } from "@/lib/path";
import { PROJECT_ICON_IDS, isProjectIcon, isProjectIconFile, projectIcon } from "@/lib/projects";
import { tintOf } from "@/lib/tints";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useStore } from "@/state/store";
import type { Server, Workspace } from "@/state/types";

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
      <div className="flex shrink-0 items-center border-b border-border px-5 py-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Button type="button" variant="ghost" size="sm" className="h-auto px-1" onClick={onBack}>
                  Workspaces
                </Button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold">{workspace.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
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
