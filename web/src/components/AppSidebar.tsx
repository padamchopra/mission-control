import type { ComponentProps, ComponentType } from "react";
import { useEffect, useState } from "react";
import { Archive, ArrowUpCircle, ChevronLeft, Clock, Settings2, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SETTINGS_SECTIONS, type SettingsTab } from "@/components/Settings";
import { ClaudeMark } from "@/components/ClaudeMark";
import { WorkspaceMark } from "@/components/WorkspaceIcon";
import { deviceIcon } from "@/lib/devices";
import { displayPath, plainText } from "@/lib/path";
import { apiError } from "@/lib/api-error";
import { workspaceForPath } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { Chat, ChatState, Server, Workspace } from "@/state/types";

export function AppSidebar({
  view,
  settingsTab,
  section,
  selected,
  servers,
  scoped,
  workspaces,
  needsYou,
  sections,
  onSection,
  onSelectChat,
  openSettings,
  closeSettings,
  updateAvailable,
}: {
  view: "app" | "settings";
  settingsTab: SettingsTab;
  section: string;
  selected: string | null;
  servers: Server[];
  scoped: Chat[];
  workspaces: Workspace[];
  needsYou: number;
  sections: { id: string; label: string; icon: ComponentType<{ className?: string }> }[];
  onSection: (id: string) => void;
  onSelectChat: (id: string) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  updateAvailable?: boolean;
}) {
  const now = useTicker(scoped.some((chat) => chat.workingSince));

  return (
    <Sidebar collapsible="none" className="border-r border-sidebar-border">
      {view === "settings" ? (
        <>
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={closeSettings}>
                  <ChevronLeft />
                  Back
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton isActive={settingsTab === id} onClick={() => openSettings(id)}>
                        <Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                      {id === "general" && updateAvailable && <SidebarMenuBadge>1</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </>
      ) : (
        <>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {sections.map(({ id, label, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton isActive={section === id} onClick={() => onSection(id)}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                    {id === "inbox" && needsYou > 0 && <SidebarMenuBadge>{needsYou}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarContent>
            <SidebarGroup className="min-h-0 flex-1">
              <SidebarGroupLabel>
                Threads
                {scoped.length > 0 && <span className="ml-auto tabular-nums">{scoped.length}</span>}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {scoped.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">No threads yet.</p>
                  ) : (
                    scoped.map((chat) => (
                      <SidebarMenuItem key={chat.id}>
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <ThreadRow
                              chat={chat}
                              active={selected === chat.id}
                              workspace={workspaces[workspaceForPath(chat.cwd, workspaces)]}
                              server={servers.find((entry) => entry.id === chat.serverId)}
                              now={now}
                              onSelect={() => onSelectChat(chat.id)}
                            />
                          </ContextMenuTrigger>
                          <ThreadMenu chat={chat} />
                        </ContextMenu>
                      </SidebarMenuItem>
                    ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </>
      )}

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          {view !== "settings" && updateAvailable && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => openSettings("general")}>
                <ArrowUpCircle />
                <span>Update available</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={view === "settings"}
              onClick={() => openSettings(view === "settings" ? settingsTab : "general")}
            >
              <Settings2 />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function StateDot({ state, className }: { state: ChatState; className?: string }) {
  return (
    <span
      className={cn(
        "mt-1.5 size-1.5 shrink-0 rounded-full",
        className,
        state === "needs_input" && "bg-warning",
        state === "working" && "bg-info",
        state === "error" && "bg-destructive",
        state === "idle" && "bg-muted-foreground/60",
      )}
    />
  );
}


/// What you can do to a thread without opening it.
///
/// Both actions end the thread, so neither is offered while it is working or
/// waiting on you — there is a turn in flight to lose. The server refuses them
/// in that state too.
function ThreadMenu({ chat }: { chat: Chat }) {
  const archiveThread = useStore((s) => s.archiveThread);
  const deleteThread = useStore((s) => s.deleteThread);
  const [confirming, setConfirming] = useState(false);
  const busy = chat.state === "working" || chat.state === "needs_input";

  const archive = async () => {
    try {
      await archiveThread(chat.id);
      toast.success("Archived the thread.", { description: "It is in Settings, under Archived threads." });
    } catch (caught) {
      toast.error("Couldn't archive that thread", { description: apiError(caught) });
    }
  };

  const remove = async () => {
    try {
      await deleteThread(chat.id);
      toast.success("Deleted the thread.");
    } catch (caught) {
      toast.error("Couldn't delete that thread", { description: apiError(caught) });
    }
  };

  return (
    <>
      <ContextMenuContent className="w-44">
        <ContextMenuItem disabled={busy} onSelect={() => void archive()}>
          <Archive />
          Archive
        </ContextMenuItem>
        <ContextMenuItem disabled={busy} variant="destructive" onSelect={() => setConfirming(true)}>
          <Trash2 />
          Delete
        </ContextMenuItem>
        {busy && (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel className="font-normal text-muted-foreground">
              {chat.state === "working" ? "Still working." : "Waiting on you."}
            </ContextMenuLabel>
          </>
        )}
      </ContextMenuContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {chat.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation goes with it. Archive instead to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              Delete thread
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/// One thread in the list: what it is, where it runs, and what it is doing.
function ThreadRow({
  chat,
  active,
  workspace,
  server,
  now,
  onSelect,
  ...trigger
}: {
  chat: Chat;
  active: boolean;
  workspace?: Workspace;
  server?: Server;
  now: number;
  onSelect: () => void;
  // `ContextMenuTrigger asChild` hands its ref and handlers down; without
  // spreading them onto the button, right-click never reaches the menu.
} & ComponentProps<"button">) {
  const DeviceIcon = deviceIcon(server?.icon);
  const place = workspace?.name ?? displayPath(chat.cwd);
  const elapsed = chat.workingSince ? since(chat.workingSince, now) : undefined;

  return (
    <SidebarMenuButton
      {...trigger}
      isActive={active}
      className="h-auto flex-col items-stretch gap-1 py-2"
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <StateDot state={chat.state} className="mt-0" />
        <WorkspaceMark home={!workspace} workspace={workspace} server={server} size="sm" />
        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
      </span>

      {chat.preview && (
        <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{plainText(chat.preview)}</span>
      )}

      {/* The place is what you read; the marks are what you glance at, so they
          hold the right edge rather than crowding the name. */}
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{place}</span>
        {elapsed && (
          <span className="flex shrink-0 items-center gap-1 tabular-nums">
            <Clock className="size-3" />
            {elapsed}
          </span>
        )}
        <ProviderMark model={chat.model} />
        {server && (
          <Tooltip>
            <TooltipTrigger asChild>
              <DeviceIcon className="size-3 shrink-0" />
            </TooltipTrigger>
            <TooltipContent>{server.name}</TooltipContent>
          </Tooltip>
        )}
      </span>
    </SidebarMenuButton>
  );
}

/// Which model the thread runs on. Claude is the only provider today, so the
/// glyph stands for it and the label names the model when one was picked.
function ProviderMark({ model }: { model?: string }) {
  const label = model ? model[0].toUpperCase() + model.slice(1) : "Default";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 items-center gap-0.5 text-claude">
          <ClaudeMark className="size-3" />
          {model && <span className="text-muted-foreground">{label}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>Claude · {label}</TooltipContent>
    </Tooltip>
  );
}

/// A clock that only runs while something on screen needs it, so an idle
/// sidebar re-renders no more than the data does.
function useTicker(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

/// How long a thread has been at it, at a glance. Seconds while that is the
/// interesting number, then minutes, then hours.
export function since(start: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
