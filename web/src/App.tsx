import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Folder,
  GitPullRequest,
  Inbox,
  MessagesSquare,
  Plus,
  RefreshCw,
  Search,
  SquarePen,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/AppSidebar";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatView } from "@/components/ChatView";
import { Palette } from "@/components/Palette";
import { AddWorkspaceDialog } from "@/components/AddWorkspace";
import { SettingsPane, type SettingsTab } from "@/components/Settings";
import { devicesForWorkspace, WorkspaceSettings } from "@/components/WorkspaceSettings";
import { useRelease } from "@/hooks/use-release";
import { deviceIcon } from "@/lib/devices";
import { displayPath } from "@/lib/path";
import { isProjectIconFile } from "@/lib/projects";
import { WorkspaceIcon } from "@/components/WorkspaceIcon";
import { tintOf } from "@/lib/tints";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { ChatState } from "@/state/types";
import remyMark from "@/assets/remy-mark.png";

type Section = "inbox" | "chats" | "workspaces" | "prs" | "loops";

const SECTIONS: { id: Section; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "chats", label: "Threads", icon: MessagesSquare },
  { id: "workspaces", label: "Workspaces", icon: Folder },
  { id: "prs", label: "Pull requests", icon: GitPullRequest },
  { id: "loops", label: "Loops", icon: RefreshCw },
];

const STATE_TONE: Record<ChatState, "warning" | "info" | "secondary" | "destructive"> = {
  needs_input: "warning",
  working: "info",
  idle: "secondary",
  error: "destructive",
};

const STATE_LABEL: Record<ChatState, string> = {
  needs_input: "Needs you",
  working: "Working",
  idle: "Idle",
  error: "Error",
};

const EMPTY: Record<
  Section,
  { title: string; detail: string; action: "none" | "chat" | "workspace" | "loop"; icon: typeof Inbox }
> = {
  inbox: {
    title: "Inbox is clear",
    detail: "Nothing is waiting on you.",
    action: "none",
    icon: Inbox,
  },
  chats: {
    title: "No threads yet",
    detail: "Start one in a workspace on this machine.",
    action: "chat",
    icon: MessagesSquare,
  },
  workspaces: {
    title: "No workspaces yet",
    detail: "Add a folder on this machine to run threads in.",
    action: "workspace",
    icon: Folder,
  },
  prs: {
    title: "No pull requests",
    detail: "Open a PR from a workspace on this machine.",
    action: "none",
    icon: GitPullRequest,
  },
  loops: {
    title: "No loops yet",
    detail: "Schedule a recurring run on a workspace.",
    action: "loop",
    icon: RefreshCw,
  },
};

export function App() {
  const [section, setSection] = useState<Section>("chats");
  const [scope, setScope] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [view, setView] = useState<"app" | "settings">("app");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [addWorkspaceOpen, setAddWorkspaceOpen] = useState(false);
  const [workspaceSettingsId, setWorkspaceSettingsId] = useState<string | null>(null);

  const openSettings = (tab: SettingsTab = "general") => {
    setWorkspaceSettingsId(null);
    setSettingsTab(tab);
    setView("settings");
  };

  const closeSettings = () => {
    setWorkspaceSettingsId(null);
    setView("app");
  };

  const servers = useStore((s) => s.servers);
  const allChats = useStore((s) => s.chats);
  const allWorkspaces = useStore((s) => s.workspaces);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const start = useStore((s) => s.start);
  const loadSettings = useStore((s) => s.loadSettings);
  const release = useRelease();

  // Opens the connection and holds it for the life of the app.
  useEffect(() => start(), [start]);

  useEffect(() => {
    if (error) toast.error("Can't reach this machine", { description: error });
  }, [error]);

  // The composer starts a chat on this machine's defaults, so they are read as
  // soon as it answers rather than only when Settings is opened.
  const anyServerOnline = servers.some((server) => server.online);
  useEffect(() => {
    if (!anyServerOnline) return;
    void loadSettings().catch(() => {
      // A machine that cannot answer already shows as offline.
    });
  }, [anyServerOnline, loadSettings]);

  const scoped = useMemo(
    () => (scope ? allChats.filter((chat) => chat.serverId === scope) : allChats),
    [allChats, scope],
  );
  const chats = useMemo(
    () => (section === "inbox" ? scoped.filter((chat) => chat.state === "needs_input") : scoped),
    [scoped, section],
  );
  const workspaces = useMemo(
    () => (scope ? allWorkspaces.filter((workspace) => workspace.serverId === scope) : allWorkspaces),
    [allWorkspaces, scope],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape" && !paletteOpen) {
        if (workspaceSettingsId) {
          event.preventDefault();
          setWorkspaceSettingsId(null);
          return;
        }
        if (view === "settings") {
          event.preventDefault();
          setView("app");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, view, workspaceSettingsId]);

  const active = chats.find((chat) => chat.id === selected) ?? null;
  const needsYou = scoped.filter((chat) => chat.state === "needs_input").length;
  const working = scoped.filter((chat) => chat.state === "working").length;
  const anyOnline = servers.some((s) => s.online);
  const openWorkspace = allWorkspaces.find((workspace) => workspace.id === workspaceSettingsId) ?? null;
  // Chats live in the sidebar, so the main pane is either the chat you opened or
  // the composer for the next one. There is no list of them here.
  const canCompose = !loading && !error && servers.length > 0;

  const draftChat = () => setSelected(null);

  const openChat = (id: string) => {
    setWorkspaceSettingsId(null);
    setSection("chats");
    setSelected(id);
  };

  const chatCounts = (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span>{needsYou} need you</span>
      <span>{working} active</span>
      <span>{scoped.length - needsYou - working} idle</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Titlebar. Draggable, with the leading inset clearing the traffic lights. */}
      <header
        className="app-drag flex shrink-0 items-center gap-3 border-b border-border bg-sidebar pr-3"
        style={{ height: "var(--workspace-topbar-height)", paddingLeft: "var(--titlebar-traffic-light-inset)" }}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <img src={remyMark} alt="" className="size-6" />
          Remy
        </span>
        <div className="app-no-drag ml-auto flex items-center gap-2">
          <Badge variant={anyOnline ? "success" : "secondary"}>
            <span className="size-1.5 rounded-full bg-current" />
            {servers.length} device{servers.length === 1 ? "" : "s"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
            <Search />
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
        </div>
      </header>

      <SidebarProvider className="min-h-0 flex-1">
        <AppSidebar
          view={view}
          settingsTab={settingsTab}
          section={section}
          scope={scope}
          selected={selected}
          servers={servers}
          chats={allChats}
          scoped={scoped}
          workspaces={allWorkspaces}
          needsYou={needsYou}
          sections={SECTIONS}
          onScope={setScope}
          onSection={(id) => {
            setWorkspaceSettingsId(null);
            setSection(id as Section);
          }}
          onSelectChat={openChat}
          openSettings={openSettings}
          closeSettings={closeSettings}
          updateAvailable={release.available}
        />

        {view === "settings" ? (
          <SettingsPane tab={settingsTab} release={release} />
        ) : openWorkspace ? (
          <WorkspaceSettings workspace={openWorkspace} onBack={() => setWorkspaceSettingsId(null)} />
        ) : (
          <main className="flex min-w-0 flex-1 flex-col">
            {section === "chats" && active ? (
              <ChatView key={active.id} chat={active} headerEnd={<NewChatButton onClick={draftChat} />} />
            ) : section === "chats" && canCompose ? (
              <ChatComposer
                workspaces={workspaces}
                servers={scope ? servers.filter((server) => server.id === scope) : servers}
                onCreated={(id) => setSelected(id)}
                onAddWorkspace={() => setAddWorkspaceOpen(true)}
                headerEnd={chatCounts}
              />
            ) : (
              <>
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
              <h1 className="text-xl font-semibold tracking-tight">
                {SECTIONS.find((s) => s.id === section)?.label}
              </h1>
              <div className="ml-auto flex items-center gap-4">
                {(section === "inbox" || section === "chats") && chatCounts}
                {section === "workspaces" && (
                  <Button size="sm" onClick={() => setAddWorkspaceOpen(true)}>
                    <Plus />
                    Add workspace
                  </Button>
                )}
                {section === "loops" && (
                  <Button size="sm">
                    <Plus />
                    New loop
                  </Button>
                )}
              </div>
            </div>

            {section === "inbox" ? (
              chats.length === 0 ? (
                <EmptyState
                  section={section}
                  loading={loading}
                  error={error}
                  hasServers={servers.length > 0}
                  onAddConnection={() => openSettings("devices")}
                  onAddWorkspace={() => setAddWorkspaceOpen(true)}
                />
              ) : (
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex flex-col gap-3 p-4">
                    {chats.map((chat) => (
                      <Message
                        key={chat.id}
                        className={cn(
                          "cursor-pointer rounded-xl border px-3 py-3",
                          active?.id === chat.id ? "border-primary/40" : "hover:bg-accent",
                        )}
                        role="button"
                        tabIndex={0}
                        onClick={() => openChat(chat.id)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          openChat(chat.id);
                        }}
                      >
                        <MessageContent className="gap-1.5">
                          <MessageHeader className="gap-2 px-0 text-foreground">
                            <StateDot state={chat.state} />
                            <span className="truncate font-medium">{chat.title}</span>
                            {chat.state !== "idle" && (
                              <Badge variant={STATE_TONE[chat.state]}>
                                {chat.state === "working" ? (
                                  <span className="shimmer">{STATE_LABEL[chat.state]}</span>
                                ) : (
                                  STATE_LABEL[chat.state]
                                )}
                              </Badge>
                            )}
                          </MessageHeader>
                          {chat.preview && (
                            <Bubble variant="muted" className="max-w-full">
                              <BubbleContent className="line-clamp-2">{chat.preview}</BubbleContent>
                            </Bubble>
                          )}
                          <MessageFooter className="px-0 font-mono">{displayPath(chat.cwd)}</MessageFooter>
                        </MessageContent>
                      </Message>
                    ))}
                  </div>
                </ScrollArea>
              )
            ) : section === "workspaces" ? (
              workspaces.length === 0 ? (
                <EmptyState
                  section={section}
                  loading={loading}
                  error={error}
                  hasServers={servers.length > 0}
                  onAddConnection={() => openSettings("devices")}
                  onAddWorkspace={() => setAddWorkspaceOpen(true)}
                />
              ) : (
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex flex-col gap-2 p-4">
                    {workspaces.map((workspace) => {
                      const colors = tintOf(workspace.tint);
                      const devices = devicesForWorkspace(workspace, allWorkspaces, servers);
                      return (
                      <Card
                        key={workspace.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setWorkspaceSettingsId(workspace.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setWorkspaceSettingsId(workspace.id);
                          }
                        }}
                        className="cursor-pointer gap-0 py-0 shadow-none hover:bg-accent"
                      >
                        <div className="flex items-center gap-3 px-3.5 py-2.5">
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg",
                              colors.well,
                              colors.fg,
                            )}
                          >
                            <WorkspaceIcon
                              workspaceId={workspace.id}
                              icon={workspace.icon}
                              className={isProjectIconFile(workspace.icon) ? "size-8" : "size-4"}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm leading-5 font-medium">{workspace.name}</span>
                            <span className="block truncate font-mono text-[11px] leading-4 text-muted-foreground">
                              {displayPath(workspace.path)}
                            </span>
                          </span>
                          {devices.length > 0 && (
                            <span className="flex shrink-0 items-center -space-x-1.5">
                              {devices.map((server) => {
                                const DeviceIcon = deviceIcon(server.icon);
                                const chip = tintOf(server.tint);
                                return (
                                  <Tooltip key={server.id}>
                                    <TooltipTrigger asChild>
                                      <span
                                        className={cn(
                                          "relative flex size-6 items-center justify-center rounded-full border border-background",
                                          chip.well,
                                          chip.fg,
                                        )}
                                      >
                                        <DeviceIcon className="size-3" />
                                        <span
                                          className={cn(
                                            "absolute -right-0 -bottom-0 size-1.5 rounded-full ring-1 ring-background",
                                            server.online ? "bg-success" : "bg-muted-foreground",
                                          )}
                                        />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{server.name}</TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </span>
                          )}
                        </div>
                      </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              )
            ) : (
              <EmptyState
                section={section}
                loading={loading}
                error={error}
                hasServers={servers.length > 0}
                onAddConnection={() => openSettings("devices")}
                onAddWorkspace={() => setAddWorkspaceOpen(true)}
              />
            )}
              </>
            )}
          </main>
        )}
      </SidebarProvider>

      <AddWorkspaceDialog open={addWorkspaceOpen} onOpenChange={setAddWorkspaceOpen} />
      <Palette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        chats={scoped}
        onOpenChat={(id) => {
          closeSettings();
          openChat(id);
        }}
        onOpenSection={(id) => {
          closeSettings();
          setSection(id as Section);
        }}
        sections={SECTIONS}
      />
    </div>
  );
}

function NewChatButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="New thread" onClick={onClick}>
          <SquarePen />
        </Button>
      </TooltipTrigger>
      <TooltipContent>New thread</TooltipContent>
    </Tooltip>
  );
}

function StateDot({ state }: { state: ChatState }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        state === "needs_input" && "bg-warning",
        state === "working" && "bg-info",
        state === "error" && "bg-destructive",
        state === "idle" && "bg-muted-foreground/60",
      )}
    />
  );
}

function EmptyState({
  section,
  loading,
  error,
  hasServers,
  onAddConnection,
  onAddWorkspace,
}: {
  section: Section;
  loading: boolean;
  error?: string;
  hasServers: boolean;
  onAddConnection: () => void;
  onAddWorkspace: () => void;
}) {
  const fallback = EMPTY[section];
  const { title, detail, action, icon: Icon } = loading
    ? { title: "Connecting…", detail: "Loading threads from this machine.", action: "none" as const, icon: fallback.icon }
    : error
      ? { title: "Can't reach this machine", detail: error, action: "none" as const, icon: fallback.icon }
      : !hasServers
        ? {
            title: "No devices connected",
            detail: "Pair a machine from Devices.",
            action: "connect" as const,
            icon: fallback.icon,
          }
        : fallback;

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className={loading ? "shimmer" : undefined}>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      {action !== "none" && (
        <EmptyContent>
          {action === "connect" && (
            <Button onClick={onAddConnection}>
              Add a connection
              <ArrowUpRight />
            </Button>
          )}
          {action === "chat" && (
            <Button>
              <Plus />
              New thread
            </Button>
          )}
          {action === "workspace" && (
            <Button onClick={onAddWorkspace}>
              <Plus />
              Add workspace
            </Button>
          )}
          {action === "loop" && (
            <Button>
              <Plus />
              New loop
            </Button>
          )}
        </EmptyContent>
      )}
    </Empty>
  );
}
