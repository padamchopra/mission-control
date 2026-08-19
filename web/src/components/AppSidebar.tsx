import type { ComponentType } from "react";
import { ArrowUpCircle, ChevronDown, ChevronLeft, Plus, Settings2 } from "lucide-react";
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
import { SETTINGS_SECTIONS, type SettingsTab } from "@/components/Settings";
import { deviceIcon, type DeviceIconId } from "@/lib/devices";
import { displayPath } from "@/lib/path";
import { tintOf, type TintId } from "@/lib/tints";
import { cn } from "@/lib/utils";
import type { Chat, ChatState, Server } from "@/state/types";

export function AppSidebar({
  view,
  settingsTab,
  section,
  scope,
  selected,
  servers,
  chats,
  scoped,
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
                          {servers.length} device{servers.length === 1 ? "" : "s"} · {chats.length} chat
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
                          detail={`${server.code} · ${chats.filter((chat) => chat.serverId === server.id).length} chats`}
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
                Chats
                {scoped.length > 0 && <span className="ml-auto tabular-nums">{scoped.length}</span>}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {scoped.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet.</p>
                  ) : (
                    scoped.map((chat) => (
                      <SidebarMenuItem key={chat.id}>
                        <SidebarMenuButton
                          isActive={selected === chat.id}
                          className="h-auto items-start py-1.5"
                          onClick={() => onSelectChat(chat.id)}
                        >
                          <StateDot state={chat.state} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{chat.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[chat.model, displayPath(chat.cwd)].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </SidebarMenuButton>
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

function StateDot({ state }: { state: ChatState }) {
  return (
    <span
      className={cn(
        "mt-1.5 size-1.5 shrink-0 rounded-full",
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
