import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Box, Check, ChevronDown, Folder, FolderGit2, GitBranch } from "lucide-react";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ComposerMenu } from "@/components/ComposerMenu";
import { WorkspaceMark } from "@/components/WorkspaceIcon";
import { MODELS, PERMISSIONS, modelLabel, permissionOf, type PermissionValue } from "@/lib/chat-options";
import { apiError } from "@/lib/api-error";
import { deviceIcon } from "@/lib/devices";
import { useStore } from "@/state/store";
import type { GitBranch as Branch, Server, Workspace } from "@/state/types";

const HOME = "home";
const DEVICE_PREFIX = "device:";

function deviceValue(id: string): string {
  return `${DEVICE_PREFIX}${id}`;
}

function deviceIdFromValue(value: string): string | undefined {
  return value.startsWith(DEVICE_PREFIX) ? value.slice(DEVICE_PREFIX.length) : undefined;
}

const CHECKOUTS = [
  { value: "main", label: "Main checkout", icon: Folder },
  { value: "worktree", label: "New worktree", icon: FolderGit2 },
] as const;

/// What a new worktree starts from. `remote` keeps it current with the default
/// branch on the remote; `local` follows whatever the main checkout is on.
function worktreeBase(branch?: string | null, mode?: "remote" | "local"): string {
  const name = branch || "main";
  return mode === "local" ? name : `origin/${name}`;
}

export function ChatComposer({
  workspaces,
  servers,
  onCreated,
  onAddWorkspace,
  headerEnd,
}: {
  workspaces: Workspace[];
  servers: Server[];
  onCreated: (id: string) => void;
  onAddWorkspace: () => void;
  headerEnd?: ReactNode;
}) {
  const createChat = useStore((s) => s.createChat);
  const checkoutBranch = useStore((s) => s.checkoutBranch);
  const settings = useStore((s) => s.settings);
  const [target, setTarget] = useState(workspaces[0]?.id ?? HOME);
  const [serverId, setServerId] = useState(() => preferredServer(servers)?.id ?? "");
  const [model, setModel] = useState("");
  const [modelPicked, setModelPicked] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionValue>("default");
  const [checkout, setCheckout] = useState<(typeof CHECKOUTS)[number]["value"]>("main");
  const [branch, setBranch] = useState<string>();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const workspace = workspaces.find((entry) => entry.id === target);
  const home = target === HOME || !workspace;
  const server = home
    ? servers.find((entry) => entry.id === serverId) ?? preferredServer(servers)
    : servers.find((entry) => entry.id === workspace.serverId) ?? preferredServer(servers);
  const git = Boolean(!home && workspace && workspace.worktrees.length > 0);
  const mainBranch = (!home && workspace
    ? workspace.worktrees.find((entry) => entry.isMain)?.branch
      ?? workspace.worktrees[0]?.branch
    : undefined) ?? undefined;
  const place = home ? (server?.name ?? "~") : workspace.name;
  const DeviceIcon = deviceIcon(server?.icon);
  const canSend = Boolean(text.trim() && server && !busy);
  const permission = permissionOf(permissionMode);
  const PermissionIcon = permission.icon;
  const permissionLabel = permission.label;
  const checkoutLabel = CHECKOUTS.find((entry) => entry.value === checkout)?.label ?? "Main checkout";
  const CheckoutIcon = checkout === "worktree" ? FolderGit2 : Folder;
  const branchName = branch ?? mainBranch;

  useEffect(() => {
    if (modelPicked) return;
    setModel(settings?.defaultModel ?? "");
  }, [settings?.defaultModel, modelPicked]);

  // Switching workspace re-applies this machine's defaults rather than keeping
  // the last workspace's branch.
  useEffect(() => {
    const mode = settings?.defaultCheckout ?? "main";
    setCheckout(mode);
    setBranch(mode === "worktree" ? worktreeBase(mainBranch, settings?.worktreeBase) : mainBranch ?? undefined);
  }, [workspace?.id, mainBranch, settings?.defaultCheckout, settings?.worktreeBase]);

  const pickWorkspace = (value: string) => {
    const id = deviceIdFromValue(value);
    if (id) {
      setTarget(HOME);
      setServerId(id);
      return;
    }
    setTarget(value);
    const next = workspaces.find((entry) => entry.id === value);
    if (next) setServerId(next.serverId);
  };

  const pickCheckout = (value: string) => {
    const next = value as (typeof CHECKOUTS)[number]["value"];
    setCheckout(next);
    setBranch(next === "worktree" ? worktreeBase(mainBranch, settings?.worktreeBase) : mainBranch);
  };

  const pickDevice = (id: string) => {
    setServerId(id);
    if (!workspace || workspace.serverId === id) return;
    const sibling = workspaces.find(
      (entry) =>
        entry.serverId === id
        && (workspace.origin ? entry.origin === workspace.origin : entry.name === workspace.name),
    );
    setTarget(sibling?.id ?? HOME);
  };

  const submit = async () => {
    if (!canSend || !server) return;
    setBusy(true);
    try {
      let cwd = home || !workspace ? "~" : mainPath(workspace);
      if (git && workspace && branchName) {
        const next = await checkoutBranch({
          workspaceId: workspace.id,
          branch: branchName,
          mode: checkout,
        });
        cwd = next.path;
      }
      const created = await createChat({
        cwd,
        text,
        serverId: server.id,
        model: model || undefined,
        permissionMode,
      });
      onCreated(created.id);
    } catch (caught) {
      toast.error("Couldn't start that thread", { description: apiError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const picker = {
    home,
    workspace,
    workspaces,
    servers,
    serverId: server?.id ?? "",
    onPick: pickWorkspace,
    onAddWorkspace,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-auto gap-1.5 px-1">
                    <WorkspaceMark home={home} workspace={workspace} server={server} size="sm" />
                    {place}
                  </Button>
                </DropdownMenuTrigger>
                <WorkspaceMenu {...picker} />
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium">New thread</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {headerEnd ? <div className="ml-auto flex items-center gap-4">{headerEnd}</div> : null}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-2xl flex-col gap-8">
          <h2 className="flex flex-wrap items-center justify-center gap-x-1.5 text-3xl font-medium leading-none tracking-tight">
            <span>What do you want to do in</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                className="inline-flex cursor-pointer appearance-none items-center gap-1.5 whitespace-nowrap border-x-0 border-t-0 border-b border-dotted border-muted-foreground bg-transparent p-0 font-[inherit] text-[inherit] leading-none outline-none"
              >
                <WorkspaceMark home={home} workspace={workspace} server={server} size="lg" />
                {place}
              </DropdownMenuTrigger>
              <WorkspaceMenu {...picker} />
            </DropdownMenu>
            <span>?</span>
          </h2>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (document.activeElement?.closest("[data-slot=command-input]")) return;
              void submit();
            }}
          >
            <InputGroup className="items-stretch rounded-xl">
              <InputGroupTextarea
                ref={textareaRef}
                aria-label="Message"
                placeholder="Ask a question or describe a change."
                value={text}
                disabled={busy}
                className="min-h-28"
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  void submit();
                }}
              />
              <InputGroupAddon align="block-end">
                <ComposerMenu
                  icon={Box}
                  label={modelLabel(model)}
                  value={model}
                  onChange={(value) => {
                    setModelPicked(true);
                    setModel(value);
                  }}
                  options={MODELS}
                />
                <ComposerMenu
                  icon={PermissionIcon}
                  label={permissionLabel}
                  value={permissionMode}
                  onChange={(value) => setPermissionMode(value as PermissionValue)}
                  options={PERMISSIONS}
                />
                <InputGroupButton
                  type="submit"
                  variant="default"
                  size="icon-sm"
                  className="ml-auto rounded-full"
                  disabled={!canSend}
                  aria-label="Send"
                >
                  <ArrowUp />
                </InputGroupButton>
              </InputGroupAddon>
              <InputGroupAddon align="block-end" className="border-t">
                {servers.length > 1 ? (
                  <ComposerMenu
                    icon={DeviceIcon}
                    label={server?.name ?? "This machine"}
                    value={server?.id ?? ""}
                    onChange={pickDevice}
                    options={servers.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                      icon: deviceIcon(entry.icon),
                    }))}
                  />
                ) : (
                  <InputGroupText>
                    <DeviceIcon />
                    {server?.name ?? "This machine"}
                  </InputGroupText>
                )}
                {git && workspace && branchName ? (
                  <div className="ml-auto flex min-w-0 items-center gap-1">
                    <BranchPicker
                      workspaceId={workspace.id}
                      branch={branchName}
                      onPick={setBranch}
                    />
                    <ComposerMenu
                      icon={CheckoutIcon}
                      label={checkoutLabel}
                      value={checkout}
                      align="end"
                      onChange={pickCheckout}
                      options={CHECKOUTS}
                    />
                  </div>
                ) : null}
              </InputGroupAddon>
            </InputGroup>
          </form>
        </div>
      </div>
    </div>
  );
}

function BranchPicker({
  workspaceId,
  branch,
  onPick,
}: {
  workspaceId: string;
  branch: string;
  onPick: (value: string) => void;
}) {
  const listBranches = useStore((s) => s.listBranches);
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void listBranches(workspaceId)
      .then((next) => {
        if (!cancelled) setBranches(next);
      })
      .catch((caught) => {
        if (!cancelled) {
          setBranches([]);
          toast.error("Couldn't load branches", { description: apiError(caught) });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, listBranches]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <InputGroupButton aria-label="Branch" className="min-w-0">
          <GitBranch />
          <span className="max-w-40 truncate">{branch}</span>
          <ChevronDown />
        </InputGroupButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search branches" />
          <CommandList>
            {loading ? (
              <div className="flex flex-col gap-2 p-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                <CommandEmpty>No matching branch.</CommandEmpty>
                <CommandGroup>
                  {branches.map((entry) => (
                    <CommandItem
                      key={entry.name}
                      value={entry.name}
                      onSelect={() => {
                        onPick(entry.name);
                        setOpen(false);
                      }}
                    >
                      <GitBranch />
                      <span className="min-w-0 truncate">{entry.name}</span>
                      <span className="ml-auto flex items-center gap-2">
                        {entry.checkout === "main" ? (
                          <span className="text-muted-foreground">Main checkout</span>
                        ) : null}
                        {entry.checkout === "worktree" ? (
                          <span className="text-muted-foreground">Worktree</span>
                        ) : null}
                        {entry.name === branch ? <Check /> : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function WorkspaceMenu({
  home,
  workspace,
  workspaces,
  servers,
  serverId,
  onPick,
  onAddWorkspace,
}: {
  home: boolean;
  workspace?: Workspace;
  workspaces: Workspace[];
  servers: Server[];
  serverId: string;
  onPick: (value: string) => void;
  onAddWorkspace: () => void;
}) {
  const selected = home ? deviceValue(serverId) : workspace?.id;
  return (
    <DropdownMenuContent align="start" side="bottom" sideOffset={6}>
      {workspaces.length > 0 && (
        <DropdownMenuGroup>
          {workspaces.map((entry) => (
            <DropdownMenuItem key={entry.id} onSelect={() => onPick(entry.id)}>
              <WorkspaceMark home={false} workspace={entry} size="sm" />
              {entry.name}
              {selected === entry.id ? <Check className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      )}
      {workspaces.length > 0 && servers.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuGroup>
        {servers.map((entry) => {
          const Icon = deviceIcon(entry.icon);
          const value = deviceValue(entry.id);
          return (
            <DropdownMenuItem key={entry.id} onSelect={() => onPick(value)}>
              <Icon />
              {entry.name}
              {selected === value ? <Check className="ml-auto" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onSelect={onAddWorkspace}>
          <Folder />
          Add workspace
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

function preferredServer(servers: Server[]): Server | undefined {
  return servers.find((server) => server.local) ?? servers.find((server) => server.online) ?? servers[0];
}

function mainPath(workspace?: Workspace): string {
  if (!workspace) return "~";
  return workspace.worktrees.find((entry) => entry.isMain)?.path ?? workspace.path;
}
