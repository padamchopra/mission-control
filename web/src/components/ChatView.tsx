import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Box,
  Check,
  CircleAlert,
  Copy,
  GitBranch,
  Square,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
import { ComposerMenu } from "@/components/ComposerMenu";
import { ContextMeter } from "@/components/ContextMeter";
import { PaneHeader } from "@/components/PaneHeader";
import { ClaudeMark } from "@/components/ClaudeMark";
import { UserAvatar } from "@/components/UserAvatar";
import { Markdown } from "@/components/Markdown";
import { WorkspaceMark } from "@/components/WorkspaceIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiError } from "@/lib/api-error";
import { MODELS, PERMISSIONS, modelLabel, permissionOf } from "@/lib/chat-options";
import { deviceIcon } from "@/lib/devices";
import { displayPath } from "@/lib/path";
import { workspaceForPath } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";
import type { Chat, ChatApproval, ChatQuestionRequest, ConvDiffLine, ConvEntry } from "@/state/types";

/// One open chat: its feed, whatever it is waiting on, and the box to answer in.
///
/// The feed is fetched once when the chat opens and patched from then on by the
/// `chat` frames the server pushes as a turn streams.
export function ChatView({ chat, headerEnd }: { chat: Chat; headerEnd?: ReactNode }) {
  const detail = useStore((s) => s.detail);
  const loading = useStore((s) => s.detailLoading);
  const openChat = useStore((s) => s.openChat);
  const closeChat = useStore((s) => s.closeChat);
  const sendMessage = useStore((s) => s.sendMessage);
  const answerApproval = useStore((s) => s.answerApproval);
  const answerQuestion = useStore((s) => s.answerQuestion);
  const interrupt = useStore((s) => s.interrupt);
  const setChatOptions = useStore((s) => s.setChatOptions);

  const workspaces = useStore((s) => s.workspaces);
  const servers = useStore((s) => s.servers);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void openChat(chat.id).catch((caught) => {
      toast.error("Couldn't open that thread", { description: apiError(caught) });
    });
    return () => closeChat();
  }, [chat.id, openChat, closeChat]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [chat.id]);

  // The textarea is sized to what is in it: `scrollHeight` after a reset is the
  // height the content wants, and the class caps how far that can go.
  useEffect(() => {
    const box = textareaRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [text]);

  // Which project this chat is in, so the breadcrumb reads as a place rather
  // than a path. A chat started in `~` belongs to no workspace and wears the
  // machine instead.
  const workspace = workspaces[workspaceForPath(chat.cwd, workspaces)];
  const server = servers.find((entry) => entry.id === chat.serverId);
  const DeviceIcon = deviceIcon(server?.icon);
  // The checkout this thread runs in, which is what names its branch. A thread
  // started in a subdirectory still belongs to the deepest checkout above it,
  // and a checkout Remy added detached has no branch to name at all.
  const tree =
    workspace?.worktrees.find((entry) => entry.path === chat.cwd)
    ?? [...(workspace?.worktrees ?? [])]
      .sort((a, b) => b.path.length - a.path.length)
      .find((entry) => chat.cwd.startsWith(`${entry.path}/`));
  const branch = tree ? (tree.branch ?? "detached") : undefined;

  // The store may still hold the chat that was open a moment ago, so paint from
  // the list row until the fetch for this one lands.
  const open = detail?.id === chat.id ? detail : undefined;
  const state = open?.state ?? chat.state;
  const working = state === "working";
  const entries = open?.entries ?? [];
  const approval = open?.approval;
  const question = open?.question;

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await sendMessage(trimmed);
      setText("");
    } catch (caught) {
      toast.error("Couldn't send that message", { description: apiError(caught) });
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  };

  const permission = permissionOf(open?.permissionMode);

  const setOption = async (patch: { model?: string | null; permissionMode?: string }, what: string) => {
    try {
      await setChatOptions(patch);
    } catch (caught) {
      toast.error(`Couldn't change the ${what}`, { description: apiError(caught) });
    }
  };

  const stop = async () => {
    try {
      await interrupt();
    } catch (caught) {
      toast.error("Couldn't stop this turn", { description: apiError(caught) });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        crumbs={[
          {
            label: (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <WorkspaceMark home={!workspace} workspace={workspace} server={server} size="sm" />
                    <span className="truncate">{workspace?.name ?? server?.name ?? "This machine"}</span>
                  </span>
                </TooltipTrigger>
                {/* The path is what the name stands for, so it stays one hover away. */}
                <TooltipContent className="font-mono">{displayPath(chat.cwd)}</TooltipContent>
              </Tooltip>
            ),
          },
          { label: open?.title ?? chat.title },
        ]}
      >
        <StateBadge state={state} action={open?.action} />
        {headerEnd}
      </PaneHeader>

      <ScrollFeed chatId={chat.id} count={entries.length} working={working} className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6">
          {loading && entries.length === 0 ? (
            <FeedSkeleton />
          ) : entries.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Wrench />
                </EmptyMedia>
                <EmptyTitle>Nothing here yet</EmptyTitle>
                <EmptyDescription>Send a message to get this thread going.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            entries.map((entry, index) => (
              <Entry
                key={entry.id}
                entry={entry}
                lead={index === 0 || speaker(entries[index - 1]) !== speaker(entry)}
              />
            ))
          )}

          {approval && (
            <ApprovalCard
              approval={approval}
              onDecide={async (decision) => {
                try {
                  await answerApproval(approval.requestId, decision);
                } catch (caught) {
                  toast.error("Couldn't answer that", { description: apiError(caught) });
                }
              }}
            />
          )}

          {question && (
            <QuestionCard
              request={question}
              onAnswer={async (answers) => {
                try {
                  await answerQuestion(question.requestId, answers);
                } catch (caught) {
                  toast.error("Couldn't answer that", { description: apiError(caught) });
                }
              }}
            />
          )}

          {open?.error && (
            <Card className="gap-2 border-destructive/40 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <CircleAlert className="size-4" />
                This thread hit an error
              </p>
              <p className="text-sm text-muted-foreground">{open.error}</p>
            </Card>
          )}
        </div>
      </ScrollFeed>

      <div className="shrink-0 border-t border-border px-5 py-3">
        <form
          // The toolbar drops labels by how wide the composer is, not the
          // window: the sidebar takes a fixed slice, so the two differ.
          className="@container mx-auto w-full max-w-3xl"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <InputGroup className="items-stretch rounded-xl">
            <InputGroupTextarea
              ref={textareaRef}
              aria-label="Message"
              placeholder="Reply, or ask for the next change."
              value={text}
              // Two lines at rest, growing with what you write. The reply box
              // sits under the thread it belongs to, so idle height is space
              // taken from the conversation.
              className="max-h-56 min-h-11 resize-none"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                void submit();
              }}
            />
            {/* One row, not two: the settings and the send button are the same
                strip of chrome. */}
            <InputGroupAddon align="block-end" className="gap-1">
              <ComposerMenu
                icon={Box}
                label={modelLabel(open?.model)}
                value={open?.model ?? ""}
                disabled={!open || working}
                title={working ? "The model changes once this turn is done." : undefined}
                onChange={(value) => void setOption({ model: value || null }, "model")}
                options={MODELS}
              />
              <ComposerMenu
                icon={permission.icon}
                label={permission.label}
                value={permission.value}
                disabled={!open || working}
                title={working ? "Permissions change once this turn is done." : undefined}
                onChange={(value) => void setOption({ permissionMode: value }, "permission mode")}
                options={PERMISSIONS}
              />

              <div className="ml-auto flex min-w-0 items-center gap-1">
                {/* Where a thread runs is fixed when it starts, so these read
                    rather than offer. */}
                <InputGroupText title={displayPath(chat.cwd)} className="hidden @md:flex">
                  <DeviceIcon />
                  {server?.name ?? "This machine"}
                </InputGroupText>
                {branch && (
                  <InputGroupText title={displayPath(chat.cwd)} className="hidden min-w-0 @sm:flex">
                    <GitBranch />
                    <span className="max-w-32 truncate">{branch}</span>
                  </InputGroupText>
                )}
                <ContextMeter context={open?.context} />
                {working && (
                  <InputGroupButton type="button" onClick={() => void stop()}>
                    <Square />
                    Stop
                  </InputGroupButton>
                )}
                <InputGroupButton
                  type="submit"
                  variant="default"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={!text.trim() || busy}
                  aria-label="Send"
                >
                  <ArrowUp />
                </InputGroupButton>
              </div>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </div>
  );
}

/// Keeps the feed pinned to the newest entry, unless you have scrolled up to
/// read something — then it leaves the view where you put it.
function ScrollFeed({
  chatId,
  count,
  working,
  className,
  children,
}: {
  chatId: string;
  count: number;
  working: boolean;
  className?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    pinned.current = true;
  }, [chatId]);

  useEffect(() => {
    if (!pinned.current) return;
    const viewport = rootRef.current?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]");
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [chatId, count, working, children]);

  return (
    <ScrollArea
      ref={rootRef}
      className={className}
      onScrollCapture={(event) => {
        const viewport = event.target as HTMLElement;
        if (viewport?.dataset?.slot !== "scroll-area-viewport") return;
        const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
        pinned.current = distance < 80;
      }}
    >
      {children}
    </ScrollArea>
  );
}

/// Who an entry belongs to. Everything Claude does — its prose, its thinking,
/// its tool calls — is one side of the conversation.
function speaker(entry: ConvEntry): "you" | "claude" {
  return entry.kind === "user" ? "you" : "claude";
}

/// `lead` marks the first entry of a run. Only that one wears the avatar and
/// the name; the rest keep the column so the run stays aligned, and say nothing
/// a reader already knows.
function Entry({ entry, lead }: { entry: ConvEntry; lead: boolean }) {
  if (entry.kind === "user") {
    return (
      <Message align="end">
        {/* The slot is its own muted disc at `min-w-8`. A smaller avatar inside
            leaves that disc showing as a ring, so the avatar fills it and the
            slot carries no colour of its own. */}
        <MessageAvatar className={cn("bg-transparent", !lead && "invisible")}>
          <UserAvatar />
        </MessageAvatar>
        <MessageContent>
          {lead && <MessageHeader>You</MessageHeader>}
          <Bubble align="end">
            <BubbleContent className="whitespace-pre-wrap">{entry.text}</BubbleContent>
          </Bubble>
          {entry.text && (
            <MessageFooter className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
              <CopyPrompt text={entry.text} />
            </MessageFooter>
          )}
        </MessageContent>
      </Message>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <Message>
        <ClaudeAvatar lead={lead} />
        <MessageContent>
          {/* The provider, not the model: which Claude answered is a setting of
              the thread, and it is on the toolbar. */}
          {lead && <MessageHeader>Claude</MessageHeader>}
          <Bubble variant="ghost">
            <BubbleContent>
              <Markdown text={entry.text ?? ""} />
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  if (entry.kind === "thinking") {
    return (
      <Message>
        <ClaudeAvatar lead={lead} />
        <MessageContent>
          {lead && <MessageHeader>Claude</MessageHeader>}
          <Bubble variant="ghost">
            <BubbleContent className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground italic">
              {entry.text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  // Tool work is Claude's too, so it lines up under the same avatar column
  // rather than starting at the edge of the feed.
  return (
    <div className="pl-10">
      <ToolEntry entry={entry} />
    </div>
  );
}

/// `MessageAvatar` is the slot; `Avatar` is what goes in it, which is what
/// gives the mark its circle and keeps it from stretching.
function ClaudeAvatar({ lead }: { lead: boolean }) {
  return (
    <MessageAvatar className={cn("bg-transparent", !lead && "invisible")}>
      <Avatar>
        <AvatarFallback className="bg-claude/15 text-claude">
          <ClaudeMark className="size-4" />
        </AvatarFallback>
      </Avatar>
    </MessageAvatar>
  );
}

/// Puts a prompt back on the clipboard, for saying nearly the same thing again.
/// The tick is the confirmation — a toast for every copy would be louder than
/// the action deserves.
function CopyPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // A browser that refuses the clipboard says nothing useful, so say the
      // one thing that helps.
      toast.error("Couldn't copy that", { description: "Your browser blocked clipboard access." });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Copy prompt"
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : "Copy prompt"}</TooltipContent>
    </Tooltip>
  );
}

function ToolEntry({ entry }: { entry: ConvEntry }) {
  const failed = entry.status === "error";
  return (
    <div
      className={cn(
        // `min-w-0` so this can shrink inside the feed's column: without it a
        // long command sets the width and the whole thread scrolls sideways.
        "flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border px-3 py-2 text-xs",
        failed ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{entry.verb ?? entry.tool ?? "Tool"}</span>
        {entry.arg && (
          <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{entry.arg}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {typeof entry.adds === "number" && entry.adds > 0 && (
            <span className="font-mono text-success-foreground">+{entry.adds}</span>
          )}
          {typeof entry.dels === "number" && entry.dels > 0 && (
            <span className="font-mono text-destructive">−{entry.dels}</span>
          )}
          {failed && <Badge variant="destructive">Failed</Badge>}
        </span>
      </div>
      {entry.diff && entry.diff.length > 0 && <Diff lines={entry.diff} />}
      {entry.output && (
        // Tool output is paths and ref names — long runs with nothing to break
        // on — so it breaks anywhere rather than pushing the card wider.
        <pre className="max-h-56 overflow-auto break-all whitespace-pre-wrap text-muted-foreground">
          {entry.output}
        </pre>
      )}
    </div>
  );
}

function Diff({ lines }: { lines: ConvDiffLine[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/60 bg-background font-mono text-[11px] leading-5">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            "px-2 whitespace-pre",
            line.kind === "add" && "bg-success/12 text-success-foreground",
            line.kind === "del" && "bg-destructive/10 text-destructive",
            line.kind === "ctx" && "text-muted-foreground",
          )}
        >
          {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
          {line.text}
        </div>
      ))}
    </div>
  );
}

function ApprovalCard({
  approval,
  onDecide,
}: {
  approval: ChatApproval;
  onDecide: (decision: "allow" | "allowAlways" | "deny") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "allow" | "allowAlways" | "deny") => {
    setBusy(true);
    try {
      await onDecide(decision);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-3 border-warning/50 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{approval.title ?? `${approval.verb} ${approval.arg}`.trim()}</p>
        {approval.reason && <p className="text-xs text-muted-foreground">{approval.reason}</p>}
      </div>
      {approval.plan && (
        <div className="max-h-72 overflow-auto rounded-md bg-muted/50 p-3">
          <Markdown text={approval.plan} className="text-xs" />
        </div>
      )}
      {approval.diff && approval.diff.length > 0 && <Diff lines={approval.diff} />}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void decide("allow")}>
          Allow
        </Button>
        {approval.allowAlways && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("allowAlways")}>
            Always allow
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide("deny")}>
          Deny
        </Button>
      </div>
    </Card>
  );
}

function QuestionCard({
  request,
  onAnswer,
}: {
  request: ChatQuestionRequest;
  onAnswer: (answers: Record<string, string | string[]>) => Promise<void>;
}) {
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const toggle = (question: string, label: string, multi: boolean) => {
    setPicks((current) => {
      const chosen = current[question] ?? [];
      if (!multi) return { ...current, [question]: chosen[0] === label ? [] : [label] };
      return {
        ...current,
        [question]: chosen.includes(label)
          ? chosen.filter((item) => item !== label)
          : [...chosen, label],
      };
    });
  };

  const answered = request.questions.every((question) => (picks[question.question] ?? []).length > 0);

  const send = async () => {
    setBusy(true);
    try {
      await onAnswer(
        Object.fromEntries(
          request.questions.map((question) => {
            const chosen = picks[question.question] ?? [];
            // Claude looks answers up by the exact question text, and wants an
            // array only where it offered one.
            return [question.question, question.multiSelect ? chosen : (chosen[0] ?? "")];
          }),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-4 border-warning/50 p-4">
      {request.questions.map((question) => {
        const chosen = picks[question.question] ?? [];
        return (
          <div key={question.question} className="flex flex-col gap-2">
            {question.header && (
              <Badge variant="secondary" className="w-fit">
                {question.header}
              </Badge>
            )}
            <p className="text-sm font-medium">{question.question}</p>
            <div className="flex flex-col gap-1.5">
              {question.options.map((option) => {
                const picked = chosen.includes(option.label);
                return (
                  <Button
                    key={option.label}
                    type="button"
                    variant={picked ? "default" : "outline"}
                    aria-pressed={picked}
                    className="h-auto w-full justify-start px-3 py-2 text-left whitespace-normal"
                    onClick={() => toggle(question.question, option.label, Boolean(question.multiSelect))}
                  >
                    {picked ? <Check className="mt-0.5 shrink-0 self-start" /> : null}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">{option.label}</span>
                      {option.description && (
                        <span
                          className={cn(
                            "text-xs",
                            picked ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {option.description}
                        </span>
                      )}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
      <Button size="sm" className="w-fit" disabled={!answered || busy} onClick={() => void send()}>
        Send answer
      </Button>
    </Card>
  );
}

function StateBadge({ state, action }: { state: Chat["state"]; action?: string }) {
  if (state === "working") {
    return (
      <Badge variant="info">
        <span className="shimmer max-w-52 truncate">{action || "Working"}</span>
      </Badge>
    );
  }
  if (state === "needs_input") return <Badge variant="warning">Needs you</Badge>;
  if (state === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="secondary">Idle</Badge>;
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-2/3 self-end rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-10 w-1/2 rounded-xl" />
    </div>
  );
}
