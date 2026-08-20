import { Fragment, memo, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/// Someone the text may name, and where clicking their name goes.
export interface Mention {
  handle: string;
  label: string;
  onOpen?: () => void;
}

const COMPONENTS: Components = {
  p: ({ children }) => <p className="wrap-break-word whitespace-pre-wrap">{children}</p>,
  h1: ({ children }) => <h1 className="mt-2 text-base font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-2 text-base font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-1 text-sm font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-1 text-sm font-semibold first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="wrap-break-word">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through opacity-70">{children}</del>,
  hr: () => <hr className="border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2 hover:text-primary"
    >
      {children}
    </a>
  ),
  // Inline code is a pill. A fenced block is the same element inside `pre`,
  // which flattens the pill back out — that way a fence with no language is
  // styled like every other fence.
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-5 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted/40 px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
  input: ({ checked, type }) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={checked} readOnly className="mr-1 align-middle" />
    ) : null,
};

/// `@handle` in a run of text, wrapped as a chip.
///
/// Done on the rendered children rather than on the source, so a handle inside
/// a code fence or a link stays the literal text it was written as.
function chip(text: string, mentions: Mention[], key: string): ReactNode {
  const pattern = new RegExp(`@(${mentions.map((m) => escape(m.handle)).join("|")})\\b`, "g");
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const mention = mentions.find((entry) => entry.handle === match[1])!;
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(
      <button
        key={`${key}-${match.index}`}
        type="button"
        disabled={!mention.onOpen}
        className="rounded bg-primary/15 px-1 font-medium text-primary disabled:cursor-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={mention.onOpen}
      >
        @{mention.label}
      </button>,
    );
    last = match.index + match[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return <Fragment key={key}>{out}</Fragment>;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withMentions(mentions: Mention[]): Components {
  const decorate = (children: ReactNode): ReactNode =>
    Array.isArray(children)
      ? children.map((child, index) => (typeof child === "string" ? chip(child, mentions, String(index)) : child))
      : typeof children === "string"
        ? chip(children, mentions, "0")
        : children;
  return {
    ...COMPONENTS,
    p: ({ children }) => <p className="wrap-break-word whitespace-pre-wrap">{decorate(children)}</p>,
    li: ({ children }) => <li className="wrap-break-word">{decorate(children)}</li>,
  };
}

/// Claude answers in markdown, so the feed renders it rather than showing the
/// `##` and backticks raw.
///
/// Every element is styled here because this project has no typography plugin,
/// and chat prose wants tighter sizes than article prose anyway. Raw HTML stays
/// off — the text comes from a model and from tool output, so it is only ever
/// markdown, never markup.
export const Markdown = memo(function Markdown({
  text,
  className,
  mentions,
}: {
  text: string;
  className?: string;
  /// When given, `@handle` for anyone in this list renders as a chip that opens
  /// them. Everything else keeps the `@` it was typed with.
  mentions?: Mention[];
}) {
  const components = useMemo(
    () => (mentions?.length ? withMentions(mentions) : COMPONENTS),
    [mentions],
  );
  return (
    <div className={cn("flex flex-col gap-3 text-sm leading-relaxed", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
