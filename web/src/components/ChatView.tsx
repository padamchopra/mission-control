import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, CircleAlert, Square, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Message, MessageContent } from "@/components/ui/message";
import { Markdown } from "@/components/Markdown";
import { WorkspaceMark } from "@/components/WorkspaceIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiError } from "@/lib/api-error";
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

  // Which project this chat is in, so the breadcrumb reads as a place rather
  // than a path. A chat started in `~` belongs to no workspace and wears the
  // machine instead.
  const workspace = workspaces[workspaceForPath(chat.cwd, workspaces)];
  const server = servers.find((entry) => entry.id === chat.serverId);

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

  const stop = async () => {
    try {
      await interrupt();
    } catch (caught) {
      toast.error("Couldn't stop this turn", { description: apiError(caught) });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="min-w-0">
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
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="max-w-[46ch] truncate font-medium">
                {open?.title ?? chat.title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <StateBadge state={state} action={open?.action} />
          {headerEnd}
        </div>
      </div>

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
            entries.map((entry) => <Entry key={entry.id} entry={entry} />)
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

      <div className="shrink-0 border-t border-border px-5 py-4">
        <form
          className="mx-auto w-full max-w-3xl"
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
              className="min-h-20"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                void submit();
              }}
            />
            <InputGroupAddon align="block-end">
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
                className="ml-auto rounded-full"
                disabled={!text.trim() || busy}
                aria-label="Send"
              >
                <ArrowUp />
              </InputGroupButton>
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

function Entry({ entry }: { entry: ConvEntry }) {
  if (entry.kind === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end">
            <BubbleContent className="whitespace-pre-wrap">{entry.text}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <Message>
        <MessageContent>
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
        <MessageContent>
          <Bubble variant="ghost">
            <BubbleContent className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground italic">
              {entry.text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  return <ToolEntry entry={entry} />;
}

function ToolEntry({ entry }: { entry: ConvEntry }) {
  const failed = entry.status === "error";
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-xs",
        failed ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{entry.verb ?? entry.tool ?? "Tool"}</span>
        {entry.arg && <span className="truncate font-mono text-muted-foreground">{entry.arg}</span>}
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
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-muted-foreground">
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
