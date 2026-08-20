import { Archive, Boxes, Check, Folder, GitBranch, Github, ImagePlus, Laptop, Monitor, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import remyMark from "@/assets/remy-mark.png";
import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditableName } from "@/components/EditableName";
import { IconPicker } from "@/components/IconPicker";
import { DEVICE_ICON_IDS, deviceIcon, type DeviceIconId } from "@/lib/devices";
import { hostLabel, parsePairingLink } from "@/lib/pairing";
import { displayPath } from "@/lib/path";
import { workspaceForPath } from "@/lib/projects";
import { isNewer, summarizeNotes, type RemyRelease } from "@/lib/release";
import { transport } from "@/lib/transport";
import type { TintId } from "@/lib/tints";
import { cn } from "@/lib/utils";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { ClaudeMark } from "@/components/ClaudeMark";
import { AvatarFrom, PresetAvatar } from "@/components/UserAvatar";
import { Markdown } from "@/components/Markdown";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaneHeader } from "@/components/PaneHeader";
import { PathPickerDialog } from "@/components/PathPicker";
import { WorkspaceMark } from "@/components/WorkspaceIcon";
import { apiError } from "@/lib/api-error";
import { AVATAR_PRESETS, isImageAvatar, readAvatarFile } from "@/lib/avatars";
import {
  askToNotify,
  notificationsEnabled,
  notifyPermission,
  setNotificationsEnabled,
  type NotifyPermission,
} from "@/lib/notify";
import { useAppUpdate, type AppUpdatePhase } from "@/hooks/use-app-update";
import { useStore } from "@/state/store";
import type { Chat, Server, ToolStatus } from "@/state/types";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type SettingsTab = "general" | "version-control" | "providers" | "devices" | "archive";

export const SETTINGS_SECTIONS: {
  id: SettingsTab;
  label: string;
  icon: typeof Monitor;
}[] = [
  { id: "general", label: "General", icon: Monitor },
  { id: "version-control", label: "Version control", icon: GitBranch },
  { id: "providers", label: "Providers", icon: Boxes },
  { id: "devices", label: "Devices", icon: Laptop },
  { id: "archive", label: "Archived threads", icon: Archive },
];

export function SettingsPane({
  tab,
  release,
}: {
  tab: SettingsTab;
  release: {
    current: string;
    latest?: RemyRelease;
    pending: RemyRelease[];
    available: boolean;
    local: boolean;
    checking: boolean;
    error?: string;
    check: () => Promise<RemyRelease | undefined>;
  };
}) {
  const section = SETTINGS_SECTIONS.find((item) => item.id === tab)!;

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PaneHeader crumbs={[{ label: "Settings" }, { label: section.label }]} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6">
          {tab === "devices" ? (
            <DevicesPane />
          ) : tab === "archive" ? (
            <ArchivePane />
          ) : tab === "version-control" ? (
            <VersionControlPane />
          ) : tab === "providers" ? (
            <ProvidersPane />
          ) : (
            <GeneralPane release={release} />
          )}
        </div>
      </ScrollArea>
    </main>
  );
}

function GeneralPane({
  release,
}: {
  release: {
    current: string;
    latest?: RemyRelease;
    pending: RemyRelease[];
    available: boolean;
    local: boolean;
    checking: boolean;
    error?: string;
    check: () => Promise<RemyRelease | undefined>;
  };
}) {
  const { current, latest, pending, available, local, checking, check } = release;
  const update = useAppUpdate();

  const onCheck = async () => {
    try {
      const next = await check();
      if (!next || !isNewer(next.version, current)) {
        toast.success("You're on the latest version.");
      }
    } catch {
      toast.error("Couldn't check for updates", { description: "Try again in a bit." });
    }
  };

  const status =
    available && latest
      ? update.phase === "downloading"
        ? update.percent != null
          ? `Downloading ${latest.version} · ${update.percent}%`
          : `Downloading ${latest.version}…`
        : update.phase === "ready"
          ? `${latest.version} is ready to launch.`
          : update.phase === "installing"
            ? `Installing ${latest.version}…`
            : `${latest.version} is ready to install.`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <img src={remyMark} alt="" className="size-10 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Remy</p>
          {status ? (
            <p className="text-xs text-muted-foreground">
              {update.phase === "downloading" || update.phase === "installing" ? (
                <span className="shimmer">{status}</span>
              ) : (
                status
              )}
            </p>
          ) : (
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {checking ? <span className="shimmer">Checking…</span> : current}
            </p>
          )}
        </div>
        {/* A copy built here is not behind any release, so it is told what it
            is rather than offered a download it does not want. */}
        {local ? (
          <Badge variant="secondary">Built here</Badge>
        ) : available && latest ? (
          <UpdateButton latest={latest} pending={pending} current={current} update={update} />
        ) : (
          <Button size="sm" variant="ghost" disabled={checking} onClick={() => void onCheck()}>
            {checking ? "Checking…" : "Check for updates"}
          </Button>
        )}
      </div>
      <AvatarField />
      <NotificationsField />
      <RemyModelField />
      <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
        <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Appearance</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Dark is the only theme wired up today.</p>
        </div>
      </div>
    </div>
  );
}

const MAX_SHOWN_RELEASES = 6;

function busyLocalCount(chats: Chat[], servers: Server[]): number {
  const local = new Set(servers.filter((server) => server.local).map((server) => server.id));
  return chats.filter((chat) => {
    if (local.size > 0 && !local.has(chat.serverId)) return false;
    return chat.state === "working" || chat.state === "needs_input";
  }).length;
}

/// The download, then a relaunch that replaces this copy.
///
/// Hovering shows every release between the one running and the one on offer,
/// not just the newest of them — the point of the card is what changes for you,
/// and that is the whole run.
function UpdateButton({
  latest,
  pending,
  current,
  update,
}: {
  latest: RemyRelease;
  pending: RemyRelease[];
  current: string;
  update: {
    inApp: boolean;
    phase: AppUpdatePhase;
    percent?: number;
    download: (url?: string) => Promise<void>;
    install: () => Promise<void>;
  };
}) {
  // Someone a long way behind gets the recent run, not a scroll through every
  // release since they last opened the app.
  const shown = pending.slice(0, MAX_SHOWN_RELEASES);
  const [confirming, setConfirming] = useState(false);
  const [busyAtConfirm, setBusyAtConfirm] = useState(0);
  const busy = useStore((s) => busyLocalCount(s.chats, s.servers));
  const href = latest.downloadUrl ?? latest.pageUrl;
  const busyLabel =
    busyAtConfirm === 1 ? "A thread is still running" : `${busyAtConfirm} threads are still running`;

  const runInstall = async () => {
    try {
      await update.install();
    } catch (caught) {
      toast.error("Couldn't install the update", {
        description: caught instanceof Error ? caught.message : "Try again in a bit.",
      });
    }
  };

  const onAction = async () => {
    if (update.phase === "ready") {
      if (busy > 0) {
        setBusyAtConfirm(busy);
        setConfirming(true);
        return;
      }
      await runInstall();
      return;
    }
    if (!update.inApp && !latest.downloadUrl) {
      window.open(latest.pageUrl, "_blank", "noreferrer");
      return;
    }
    try {
      await update.download(latest.downloadUrl ?? latest.pageUrl);
    } catch (caught) {
      toast.error("Couldn't download the update", {
        description: caught instanceof Error ? caught.message : "Try again in a bit.",
      });
    }
  };

  const label =
    update.phase === "downloading"
      ? update.percent != null
        ? `Downloading ${update.percent}%`
        : "Downloading…"
      : update.phase === "ready"
        ? `Relaunch ${latest.version}`
        : update.phase === "installing"
          ? "Installing…"
          : `Download ${latest.version}`;

  const working = update.phase === "downloading" || update.phase === "installing";

  return (
    <>
      <HoverCard openDelay={120} closeDelay={80}>
        <HoverCardTrigger asChild>
          {update.inApp ? (
            <Button size="sm" disabled={working} onClick={() => void onAction()}>
              {working ? <span className="shimmer">{label}</span> : label}
            </Button>
          ) : (
            <Button asChild size="sm">
              <a href={href} target="_blank" rel="noreferrer">
                Download {latest.version}
              </a>
            </Button>
          )}
        </HoverCardTrigger>
        <HoverCardContent align="end" className="w-96 p-0">
          <div className="flex items-baseline gap-2 border-b border-border px-4 py-2.5">
            <p className="text-sm font-medium">What you'd be getting</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {current} → {latest.version}
            </p>
          </div>
          <ScrollArea className="max-h-72">
            <div className="flex flex-col gap-4 px-4 py-3">
              {shown.map((entry, index) => {
                const notes = summarizeNotes(entry.notes);
                return (
                  <div key={entry.version} className="flex flex-col gap-1">
                    {/* The one you would land on is the news; the ones under it
                        are what you skipped past to get there. */}
                    <p className="text-xs font-medium">
                      {index === 0 ? "What's changed" : `Changes in ${entry.version}`}
                    </p>
                    {notes ? (
                      <Markdown text={notes} className="text-xs" />
                    ) : (
                      <p className="text-xs text-muted-foreground">No notes for this one.</p>
                    )}
                  </div>
                );
              })}
              {pending.length > shown.length && (
                <p className="text-xs text-muted-foreground">
                  …and {pending.length - shown.length} earlier release
                  {pending.length - shown.length === 1 ? "" : "s"}.
                </p>
              )}
            </div>
          </ScrollArea>
          <a
            href={latest.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="block border-t border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Read it on GitHub
          </a>
        </HoverCardContent>
      </HoverCard>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{busyLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              Installing replaces Remy and stops every agent that is not idle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                void runInstall();
              }}
            >
              Install anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/// The face on your messages. Presets are drawn in the app; a picture is
/// resized and cropped square here before it is stored, so a settings row never
/// holds a photo straight off a phone.
function AvatarField() {
  const { settings, save } = useServerSettings();
  const useGithubAvatar = useStore((s) => s.useGithubAvatar);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  if (!settings) return null;
  const avatar = settings.avatar ?? "";

  const choose = (next: string) => {
    void save({ avatar: next }, "your avatar");
    setOpen(false);
  };

  const fromGithub = async () => {
    setBusy(true);
    try {
      await useGithubAvatar();
      setOpen(false);
    } catch (caught) {
      toast.error("Couldn't get your GitHub picture", { description: apiError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      choose(await readAvatarFile(picked));
    } catch (caught) {
      toast.error("Couldn't use that image", {
        description: caught instanceof Error ? caught.message : "Try a different one.",
      });
    }
  };

  return (
    <Field orientation="horizontal" className="items-center">
      <FieldContent>
        <FieldLabel>Your avatar</FieldLabel>
        <FieldDescription className="text-xs">
          Shown on your messages in a thread.
        </FieldDescription>
      </FieldContent>
      <div className="flex shrink-0 items-center gap-2">
        <AvatarFrom avatar={avatar} />
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Change
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Your avatar</DialogTitle>
            <DialogDescription>Pick one, or use a picture of your own.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-4 gap-3">
            <button
              type="button"
              aria-label="Default"
              onClick={() => choose("")}
              className={cn(
                "flex items-center justify-center rounded-xl border p-2",
                avatar ? "border-transparent hover:bg-accent" : "border-primary",
              )}
            >
              <PresetAvatar className="size-12" />
            </button>
            {AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-label={preset.label}
                title={preset.label}
                onClick={() => choose(`preset:${preset.id}`)}
                className={cn(
                  "flex items-center justify-center rounded-xl border p-2",
                  avatar === `preset:${preset.id}` ? "border-primary" : "border-transparent hover:bg-accent",
                )}
              >
                <PresetAvatar preset={preset} className="size-12" />
              </button>
            ))}
          </div>

          <DialogFooter className="sm:justify-between">
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <span className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}>
                <ImagePlus />
                Use a picture
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void fromGithub()}>
                <Github />
                {busy ? "Fetching…" : "From GitHub"}
              </Button>
            </span>
            {isImageAvatar(avatar) && (
              <Button type="button" variant="ghost" size="sm" onClick={() => choose("")}>
                Remove picture
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  );
}

/// Banners for a thread that needs you or has finished. Permission belongs to
/// the browser and the answer sticks, so the switch says what the browser
/// decided rather than pretending it can ask again.
function NotificationsField() {
  const [on, setOn] = useState(() => notificationsEnabled());
  const [permission, setPermission] = useState<NotifyPermission>(() => notifyPermission());

  const toggle = async (next: boolean) => {
    if (!next) {
      setNotificationsEnabled(false);
      setOn(false);
      return;
    }
    const answer = await askToNotify();
    setPermission(answer);
    if (answer !== "granted") {
      setNotificationsEnabled(false);
      setOn(false);
      toast.error(
        answer === "unsupported"
          ? "This browser can't show notifications"
          : "Your browser is blocking notifications",
        { description: "Allow them for this site, then turn this back on." },
      );
      return;
    }
    setNotificationsEnabled(true);
    setOn(true);
  };

  return (
    <Field orientation="horizontal" className="items-center">
      <FieldContent>
        <FieldLabel htmlFor="notifications">Notify me</FieldLabel>
        <FieldDescription className="text-xs">
          {permission === "denied"
            ? "Your browser is blocking notifications for this site."
            : "When a thread needs you or finishes. Clicking it opens the thread."}
        </FieldDescription>
      </FieldContent>
      <Switch
        id="notifications"
        checked={on && permission === "granted"}
        disabled={permission === "unsupported"}
        onCheckedChange={(next) => void toggle(next)}
      />
    </Field>
  );
}

/// The model Remy thinks with, as opposed to the one your chats think with.
/// It runs the small jobs Remy does around a chat rather than inside one, so a
/// fast, cheap model is the right default.
function RemyModelField() {
  const { settings, online, save } = useServerSettings();
  if (!online || !settings) return null;

  return (
    <Field orientation="horizontal" className="items-center">
      <FieldContent>
        <FieldLabel htmlFor="remy-model">Remy's own model</FieldLabel>
        <FieldDescription className="text-xs">
          Names a thread from your first message. Your threads think with their own model.
        </FieldDescription>
      </FieldContent>
      <Select
        value={settings.remyModel || "default"}
        onValueChange={(value) => void save({ remyModel: value === "default" ? "" : value }, "Remy's own model")}
      >
        <SelectTrigger id="remy-model" size="sm" className="w-44 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {REMY_MODELS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

const CHECKOUTS = [
  { value: "main", label: "Main checkout" },
  { value: "worktree", label: "New worktree" },
] as const;

const WORKTREE_BASES = [
  { value: "remote", label: "Remote default" },
  { value: "local", label: "Current branch" },
] as const;

const REPO_UPDATES = [
  { value: "off", label: "Off" },
  { value: "hourly", label: "Every hour" },
  { value: "sixHourly", label: "Every 6 hours" },
  { value: "daily", label: "Once a day" },
] as const;

const REMY_MODELS = [
  { value: "haiku", label: "Haiku" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "default", label: "Claude Code's default" },
  { value: "off", label: "Off" },
] as const;

const MODELS = [
  { value: "default", label: "Claude Code's default" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
] as const;

/// Settings live on the machine, not on this window, so both panes read them
/// from the server once and write each change straight back.
function useServerSettings() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const loadSettings = useStore((s) => s.loadSettings);
  const servers = useStore((s) => s.servers);
  const online = servers.some((server) => server.online);

  useEffect(() => {
    if (!online) return;
    void loadSettings().catch(() => {
      // The pane shows the machine as unreachable; a toast on top would repeat it.
    });
  }, [online, loadSettings]);

  const save = async (patch: Parameters<typeof saveSettings>[0], what: string) => {
    try {
      await saveSettings(patch);
    } catch (caught) {
      toast.error(`Couldn't change ${what}`, { description: apiError(caught) });
    }
  };

  return { settings, online, save };
}

function VersionControlPane() {
  const { settings, online, save } = useServerSettings();
  const tooling = useStore((s) => s.tooling);
  const loadTooling = useStore((s) => s.loadTooling);
  const [pickingRoot, setPickingRoot] = useState(false);

  useEffect(() => {
    if (online) void loadTooling().catch(() => {});
  }, [online, loadTooling]);

  if (!online) return <Unreachable />;
  if (!settings) return <p className="text-sm shimmer text-muted-foreground">Reading this machine's settings…</p>;

  return (
    <div className="flex flex-col gap-5">
      <Field orientation="horizontal" className="items-center">
        <FieldContent>
          <FieldLabel htmlFor="default-checkout">New threads open in</FieldLabel>
          <FieldDescription className="text-xs">Only applies to a workspace with worktrees.</FieldDescription>
        </FieldContent>
        <Select
          value={settings.defaultCheckout}
          onValueChange={(value) => void save({ defaultCheckout: value as "main" | "worktree" }, "that default")}
        >
          <SelectTrigger id="default-checkout" size="sm" className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {CHECKOUTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field orientation="horizontal" className="items-center">
        <FieldContent>
          <FieldLabel htmlFor="worktree-base">New worktrees branch from</FieldLabel>
          <FieldDescription className="text-xs">
            {settings.worktreeBase === "remote"
              ? "The remote's default branch, so a worktree starts current."
              : "Whatever the main checkout is on."}
          </FieldDescription>
        </FieldContent>
        <Select
          value={settings.worktreeBase}
          onValueChange={(value) => void save({ worktreeBase: value as "remote" | "local" }, "that default")}
        >
          <SelectTrigger id="worktree-base" size="sm" className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {WORKTREE_BASES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldContent>
          <FieldLabel>Worktree location</FieldLabel>
          <FieldDescription className="text-xs">
            A <code className="font-mono">.remy</code> folder here, hidden from git without touching any{" "}
            <code className="font-mono">.gitignore</code>.
          </FieldDescription>
        </FieldContent>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-w-0 flex-1 justify-start font-mono text-xs"
            onClick={() => setPickingRoot(true)}
          >
            <Folder />
            <span className="min-w-0 truncate">
              {settings.worktreeRoot ? displayPath(settings.worktreeRoot) : "Inside each workspace"}
            </span>
          </Button>
          {settings.worktreeRoot && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void save({ worktreeRoot: "" }, "the worktree location")}
            >
              Reset
            </Button>
          )}
        </div>
        <FieldDescription className="font-mono text-xs">
          {settings.worktreeRoot
            ? `${displayPath(settings.worktreeRoot)}/.remy/<repo>/<branch>`
            : "<workspace>/.remy/<branch>"}
        </FieldDescription>
      </Field>

      <PathPickerDialog
        open={pickingRoot}
        onOpenChange={setPickingRoot}
        title="Worktree location"
        description="Pick the folder Remy keeps its .remy worktrees in."
        initialPath={settings.worktreeRoot ? displayPath(settings.worktreeRoot) : "~/"}
        confirmLabel="Use folder"
        onConfirm={(picked) => void save({ worktreeRoot: picked }, "the worktree location")}
      />

      <RepoUpdateField />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">On this machine</p>
        <ToolRow name="git" label="git" status={tooling?.git} />
        <ToolRow
          name="gh"
          label="GitHub CLI"
          status={tooling?.gh}
          detail={
            tooling?.gh.available && !tooling.gh.authenticated
              ? "Installed, but not signed in — run gh auth login to open pull requests."
              : tooling?.gh.account
                ? `Signed in as ${tooling.gh.account}.`
                : undefined
          }
        />
      </div>
    </div>
  );
}

/// How often Remy refreshes the repositories, and what happened last time.
///
/// The copy is careful about what this does: fetching is safe on any checkout,
/// but moving one is not, so a checkout with uncommitted work is fetched and
/// left exactly as it was.
function RepoUpdateField() {
  const { settings, save } = useServerSettings();
  const workspaces = useStore((s) => s.workspaces);
  const run = useStore((s) => s.repoRun);
  const loadRepoRun = useStore((s) => s.loadRepoRun);
  const updateRepos = useStore((s) => s.updateRepos);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadRepoRun().catch(() => {});
  }, [loadRepoRun]);

  const now = async () => {
    setBusy(true);
    try {
      await updateRepos();
      toast.success("Workspaces are up to date.");
    } catch (caught) {
      toast.error("Couldn't sync the workspaces", { description: apiError(caught) });
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return null;
  const updated = run?.repos.filter((repo) => repo.result === "updated").length ?? 0;
  const skipped = run?.repos.filter((repo) => repo.result === "dirty").length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <Field orientation="horizontal" className="items-center">
        <FieldContent>
          <FieldLabel htmlFor="repo-update">Sync workspaces</FieldLabel>
          <FieldDescription className="text-xs">
            Fetches every workspace. Fast-forwards a main checkout only when it is clean.
          </FieldDescription>
        </FieldContent>
        <Select
          value={settings.repoUpdate}
          onValueChange={(value) =>
            void save({ repoUpdate: value as typeof settings.repoUpdate }, "how often workspaces sync")
          }
        >
          <SelectTrigger id="repo-update" size="sm" className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {REPO_UPDATES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {run
            ? `Last run ${when(run.at)} · ${updated} updated, ${run.repos.length - updated} left as they were${
                skipped ? ` (${skipped} had changes)` : ""
              }`
            : "Not run yet."}
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void now()}>
          {busy ? "Updating…" : "Update now"}
        </Button>
      </div>

      {run && run.repos.length > 0 && (
        <ItemGroup className="gap-1">
          {run.repos.map((repo) => {
            const workspace = workspaces[workspaceForPath(repo.path, workspaces)];
            return (
              <Item key={repo.path} variant="muted" size="sm" className="gap-2.5">
                <ItemMedia>
                  <WorkspaceMark home={!workspace} workspace={workspace} size="sm" />
                </ItemMedia>
                <ItemContent className="gap-0.5">
                  <ItemTitle>{workspace?.name ?? repo.workspace}</ItemTitle>
                  <ItemDescription className="text-xs">
                    {repo.detail ?? REPO_RESULT[repo.result]}
                  </ItemDescription>
                </ItemContent>
                {repo.result === "updated" && (
                  <ItemActions>
                    <Badge variant="success">Updated</Badge>
                  </ItemActions>
                )}
                {repo.result === "failed" && (
                  <ItemActions>
                    <Badge variant="destructive">Failed</Badge>
                  </ItemActions>
                )}
              </Item>
            );
          })}
        </ItemGroup>
      )}
    </div>
  );
}

const REPO_RESULT: Record<string, string> = {
  updated: "Moved forward",
  current: "Already current",
  dirty: "Has uncommitted changes",
  "no-upstream": "Tracks no remote",
  diverged: "Has local commits",
  detached: "Not on a branch",
  failed: "Git refused",
};

/// A timestamp as someone would say it out loud.
function when(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric" });
}

function ProvidersPane() {
  const { settings, online, save } = useServerSettings();
  const tooling = useStore((s) => s.tooling);
  const loadTooling = useStore((s) => s.loadTooling);

  useEffect(() => {
    if (online) void loadTooling().catch(() => {});
  }, [online, loadTooling]);

  if (!online) return <Unreachable />;
  if (!settings) return <p className="text-sm shimmer text-muted-foreground">Reading this machine's settings…</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <ToolRow
          name="claude"
          label="Claude Code"
          mark={<ClaudeMark className="size-4 text-claude" />}
          status={tooling?.claude}
          detail={
            tooling?.claude.available
              ? "Threads run through the copy of Claude Code on this machine."
              : "Install Claude Code on this machine to start threads."
          }
        />
        <p className="text-xs text-muted-foreground">
          Claude is the only provider Remy runs threads through today.
        </p>
      </div>

      <Field orientation="horizontal" className="items-center">
        <FieldContent>
          <FieldLabel htmlFor="default-model">Default model</FieldLabel>
          <FieldDescription className="text-xs">You can still change this per thread.</FieldDescription>
        </FieldContent>
        <Select
          value={settings.defaultModel || "default"}
          onValueChange={(value) => void save({ defaultModel: value === "default" ? "" : value }, "the default model")}
        >
          <SelectTrigger id="default-model" size="sm" className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
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
    </div>
  );
}

function ToolRow({
  name,
  label,
  status,
  detail,
  mark,
}: {
  name: string;
  label: string;
  status?: ToolStatus;
  detail?: string;
  /// A provider's own logo, where the row stands for one.
  mark?: ReactNode;
}) {
  const ok = status?.available && status.authenticated !== false;
  return (
    <Item variant="outline" size="sm" className="gap-2.5">
      <ItemMedia>
        {mark ?? (
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-full",
              status === undefined ? "bg-muted" : ok ? "bg-success/20 text-success-foreground" : "bg-muted",
            )}
          >
            {status === undefined ? null : ok ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
        )}
      </ItemMedia>
      <ItemContent className="gap-0.5">
        <ItemTitle>{label}</ItemTitle>
        <ItemDescription className="text-xs">
          {status === undefined
            ? "Checking…"
            : (detail ?? (status.available ? "Ready." : (status.error ?? `Remy can't run ${name} here.`)))}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="gap-2">
        {status !== undefined && !ok && <Badge variant="secondary">Not ready</Badge>}
        {status?.version && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{status.version}</span>
        )}
      </ItemActions>
    </Item>
  );
}

function Unreachable() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Laptop />
        </EmptyMedia>
        <EmptyTitle>This machine is offline</EmptyTitle>
        <EmptyDescription>Open Remy on it to change these settings.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ArchivePane() {
  const servers = useStore((s) => s.servers);
  const [items, setItems] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const serverKey = servers.map((server) => `${server.id}:${server.online ? "1" : "0"}`).join("|");

  useEffect(() => {
    let cancelled = false;
    const currentServers = useStore.getState().servers;
    setLoading(true);
    void Promise.all(
      currentServers.map(async (server) => {
        if (!server.online) return [];
        try {
          const body = await transport.request<{ archives?: RawArchive[] }>(server.id, "/archives");
          return (body.archives ?? []).map((archive) => toRow(archive, server));
        } catch {
          return [];
        }
      }),
    ).then((listed) => {
      if (cancelled) return;
      setItems(listed.flat().sort((a, b) => b.archivedAt - a.archivedAt));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [serverKey]);

  const remove = async (row: ArchiveRow) => {
    try {
      await transport.request(row.serverId, `/archives/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== row.id || item.serverId !== row.serverId));
      toast.success("Removed the archived thread.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      toast.error("Couldn't remove that archive", { description: message });
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground shimmer">Loading archives…</p>;
  }

  if (items.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Archive />
          </EmptyMedia>
          <EmptyTitle>No archived threads</EmptyTitle>
          <EmptyDescription>Archive a finished thread from its conversation when you're done.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((row) => (
        <div key={`${row.serverId}:${row.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{row.title}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {[row.serverName, row.cwd ? displayPath(row.cwd) : undefined, archivedWhen(row.archivedAt)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Remove ${row.title}`}>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {row.title}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Remy deletes the saved copy. The original chat is already gone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void remove(row)}>
                  Remove archive
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </div>
  );
}

interface RawArchive {
  id: string;
  session: string;
  archivedAt: number;
  cwd?: string | null;
  conversation?: { title?: string | null };
}

interface ArchiveRow {
  id: string;
  serverId: string;
  serverName: string;
  title: string;
  cwd?: string | null;
  archivedAt: number;
}

function toRow(archive: RawArchive, server: Server): ArchiveRow {
  return {
    id: archive.id,
    serverId: server.id,
    serverName: server.name,
    title: archive.conversation?.title?.trim() || archive.session,
    cwd: archive.cwd,
    archivedAt: archive.archivedAt,
  };
}

function archivedWhen(at: number): string {
  try {
    return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function DevicesPane() {
  const servers = useStore((s) => s.servers);
  const addServer = useStore((s) => s.addServer);
  const removeServer = useStore((s) => s.removeServer);
  const updateServer = useStore((s) => s.updateServer);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const canPair = transport.kind === "electron";

  const submit = async () => {
    const parsed = parsePairingLink(link);
    if (!parsed) {
      setError("Paste a remy://configure link from the setup script.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await addServer(parsed);
      setLink("");
      toast.success("Paired the machine.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      toast.error("Couldn't pair that machine", { description: message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await removeServer(id);
      toast.success("Removed the connection.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      toast.error("Couldn't remove that connection", { description: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        {servers.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            Starting the local Remy server…
          </p>
        ) : (
          servers.map((server) => (
            <DeviceCard
              key={server.id}
              server={server}
              busy={busy}
              canRemove={canPair && !server.local}
              onRemove={() => void remove(server.id)}
              onUpdate={(patch) => updateServer(server.id, patch)}
            />
          ))
        )}
      </div>

      {canPair && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="pairing-link">Pair another machine</Label>
          <div className="flex gap-2">
            <Input
              id="pairing-link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              placeholder="remy://configure?url=…"
              spellCheck={false}
              disabled={busy}
            />
            <Button onClick={() => void submit()} disabled={busy || !link.trim()}>
              <Plus />
              Add
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

function DeviceCard({
  server,
  busy,
  canRemove,
  onRemove,
  onUpdate,
}: {
  server: Server;
  busy: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onUpdate: (patch: { name?: string; icon?: DeviceIconId; tint?: TintId }) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
        <IconPicker
          label={`Change icon for ${server.name}`}
          icon={server.icon}
          tint={server.tint}
          icons={DEVICE_ICON_IDS}
          renderIcon={deviceIcon}
          onChange={(patch) => void onUpdate(patch)}
          badge={
            <span
              className={cn(
                "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card",
                server.online ? "bg-success" : "bg-muted-foreground",
              )}
            />
          }
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <EditableName value={server.name} label="device name" onCommit={(name) => void onUpdate({ name })} />
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {server.local ? "This machine" : `${server.code} · ${hostLabel(server.url)}`}
          </span>
        </span>

        {canRemove && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-xs" disabled={busy} aria-label={`Remove ${server.name}`}>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {server.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Remy stops talking to this machine. Pair it again from a remy:// link.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onRemove}>
                  Remove connection
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {server.online ? <StayAwakeField serverId={server.id} /> : null}
    </div>
  );
}

function StayAwakeField({ serverId }: { serverId: string }) {
  const [mode, setMode] = useState<StayAwakeMode>();
  const [supported, setSupported] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectId = `stay-awake-${serverId}`;

  useEffect(() => {
    let cancelled = false;
    void transport
      .request<{ preventSleep?: string; preventSleepSupported?: boolean }>(serverId, "/server/settings")
      .then((settings) => {
        if (cancelled) return;
        setMode(stayAwakeMode(settings.preventSleep) ?? "off");
        setSupported(settings.preventSleepSupported !== false);
      })
      .catch(() => {
        // Older servers have no settings route; hide the control.
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  if (mode === undefined) return null;

  const disabled = saving || !supported;

  const pick = async (next: string) => {
    const value = stayAwakeMode(next);
    if (!value || value === mode) return;
    const previous = mode;
    setMode(value);
    setSaving(true);
    try {
      await transport.request(serverId, "/server/settings", {
        method: "PATCH",
        body: { preventSleep: value },
      });
    } catch {
      setMode(previous);
      toast.error("Couldn't update that setting", { description: "Try again in a bit." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-3">
      <Field orientation="horizontal" data-disabled={disabled || undefined} className="items-center">
        <FieldContent>
          <FieldLabel htmlFor={selectId}>Stay awake</FieldLabel>
          <FieldDescription className="text-xs">
            {supported ? stayAwakeDetail(mode) : "Sleep prevention isn't available on this machine."}
          </FieldDescription>
        </FieldContent>
        <Select value={mode} onValueChange={(value) => void pick(value)} disabled={disabled}>
          <SelectTrigger id={selectId} size="sm" className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {STAY_AWAKE.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

type StayAwakeMode = "off" | "whileBusy" | "always";

const STAY_AWAKE: { value: StayAwakeMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "whileBusy", label: "While working" },
  { value: "always", label: "Always" },
];

function stayAwakeMode(value: unknown): StayAwakeMode | undefined {
  return STAY_AWAKE.some((option) => option.value === value) ? (value as StayAwakeMode) : undefined;
}

function stayAwakeDetail(mode: StayAwakeMode): string {
  if (mode === "whileBusy") {
    return "Stays awake while a thread is running or waiting on you. Closing the lid can still sleep it.";
  }
  if (mode === "always") {
    return "Stays awake until you pick another option or turn the machine off. Closing the lid can still sleep it.";
  }
  return "This machine sleeps as usual.";
}
