import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { ArrowUpCircle, ChevronDown, ChevronLeft, Clock, Plus, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { deviceIcon, type DeviceIconId } from "@/lib/devices";
import { displayPath, plainText } from "@/lib/path";
import { workspaceForPath } from "@/lib/projects";
import { tintOf, type TintId } from "@/lib/tints";
import { cn } from "@/lib/utils";
import type { Chat, ChatState, Server, Workspace } from "@/state/types";

export function AppSidebar({
  view,
  settingsTab,
  section,
  scope,
  selected,
  servers,
  chats,
  scoped,
  workspaces,
  needsYou,
  sections,
  onScope,
  onSection,
  onSelectChat,
  openSettings,
  closeSettings,
  updateAvailable,
}: {
  view: "app" | "settings";
  settingsTab: SettingsTab;
  section: string;
  scope: string | null;
  selected: string | null;
  servers: Server[];
  chats: Chat[];
  scoped: Chat[];
  workspaces: Workspace[];
  needsYou: number;
  sections: { id: string; label: string; icon: ComponentType<{ className?: string }> }[];
  onScope: (id: string | null) => void;
  onSection: (id: string) => void;
  onSelectChat: (id: string) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  updateAvailable?: boolean;
}) {
  const scopeServer = servers.find((server) => server.id === scope);
  const anyOnline = servers.some((server) => server.online);
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
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton size="lg" className="border border-sidebar-border bg-background">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          anyOnline ? "bg-success" : "bg-muted-foreground",
                        )}
                      />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-medium">
                          {scopeServer?.name ?? "All devices"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {servers.length} device{servers.length === 1 ? "" : "s"} · {chats.length} thread
                          {chats.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ChevronDown className="ml-auto" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    <DropdownMenuGroup>
                      <DeviceRow
                        label="All devices"
                        detail={`${servers.length} device${servers.length === 1 ? "" : "s"}`}
                        selected={scope === null}
                        online
                        onSelect={() => onScope(null)}
                      />
                      {servers.map((server) => (
                        <DeviceRow
                          key={server.id}
                          label={server.name}
                          detail={`${server.code} · ${chats.filter((chat) => chat.serverId === server.id).length} threads`}
                          selected={scope === server.id}
                          online={server.online}
                          icon={server.icon}
                          tint={server.tint}
                          onSelect={() => onScope(server.id)}
                        />
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => openSettings("devices")}>
                      <Plus />
                      Add connection
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

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
                        <ThreadRow
                          chat={chat}
                          active={selected === chat.id}
                          workspace={workspaces[workspaceForPath(chat.cwd, workspaces)]}
                          server={servers.find((entry) => entry.id === chat.serverId)}
                          now={now}
                          onSelect={() => onSelectChat(chat.id)}
                        />
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

function DeviceRow({
  label,
  detail,
  selected,
  online,
  icon,
  tint,
  onSelect,
}: {
  label: string;
  detail: string;
  selected: boolean;
  online: boolean;
  icon?: DeviceIconId;
  tint?: TintId;
  onSelect: () => void;
}) {
  const Icon = icon ? deviceIcon(icon) : undefined;
  const colors = tintOf(tint);
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn("h-auto items-start gap-2.5 py-1.5", selected && "bg-accent")}
    >
      {Icon ? (
        <span className={cn("relative mt-0.5 flex size-5 shrink-0 items-center justify-center", colors.fg)}>
          <Icon className="size-3.5" />
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full",
              online ? "bg-success" : "bg-muted-foreground",
            )}
          />
        </span>
      ) : (
        <span className={cn("mt-1 size-2 shrink-0 rounded-full", online ? "bg-success" : "bg-muted-foreground")} />
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", selected && "font-medium")}>{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </DropdownMenuItem>
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
}: {
  chat: Chat;
  active: boolean;
  workspace?: Workspace;
  server?: Server;
  now: number;
  onSelect: () => void;
}) {
  const DeviceIcon = deviceIcon(server?.icon);
  const place = workspace?.name ?? displayPath(chat.cwd);
  const elapsed = chat.workingSince ? since(chat.workingSince, now) : undefined;

  return (
    <SidebarMenuButton
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

      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{place}</span>
        <ProviderMark model={chat.model} />
        {server && (
          <Tooltip>
            <TooltipTrigger asChild>
              <DeviceIcon className="size-3 shrink-0" />
            </TooltipTrigger>
            <TooltipContent>{server.name}</TooltipContent>
          </Tooltip>
        )}
        {elapsed && (
          <span className="ml-auto flex shrink-0 items-center gap-1 tabular-nums">
            <Clock className="size-3" />
            {elapsed}
          </span>
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
