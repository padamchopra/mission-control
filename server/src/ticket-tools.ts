import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { basename } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { agentByHandle, getAgent, listAgents } from "./agents.js";
import { listProjects } from "./projects.js";
import { REMY_TOOL_INSTRUCTIONS } from "./ticket-tool-contract.js";
import { addWorkspace, listWorkspaces } from "./workspaces.js";
import {
  TICKET_STATUSES,
  commentOnTicket,
  createTicket,
  getTicket,
  handoffTicket,
  linkThread,
  listTickets,
  setTicketStatus,
  syncTicketFromThread,
  ticketActivity,
  ticketByKey,
  ticketForChat,
  updateTicket,
  type TicketStatus,
  type TicketView,
} from "./tickets.js";

interface ThreadSummary {
  id: string;
  title: string;
  cwd: string;
  state: string;
  provider: string;
  model?: string;
  agentId?: string;
  preview?: string;
}

interface ThreadDetail extends ThreadSummary {
  entries: {
    kind: string;
    text?: string;
    tool?: string;
    verb?: string;
    arg?: string;
    status?: string;
  }[];
}

export interface RemyThreadControl {
  currentCwd: string;
  list(): ThreadSummary[];
  read(id: string): ThreadDetail | undefined;
  start(input: {
    cwd: string;
    prompt: string;
    title?: string;
    agentId?: string;
    provider?: string;
    model?: string;
  }): Promise<ThreadSummary>;
  send(id: string, message: string): Promise<void>;
  stop(id: string): void;
}

function ticketFor(key: string | undefined, chatId: string): TicketView {
  const ticket = key ? ticketByKey(key) : ticketForChat(chatId);
  if (!ticket) throw new Error(key ? `No ticket called ${key}.` : "This thread is not linked to a ticket.");
  return ticket;
}

function describe(ticket: TicketView): string {
  const project = listProjects().find((entry) => entry.id === ticket.projectId);
  const children = listTickets(ticket.projectId).filter((entry) => entry.parentId === ticket.id);
  const activity = ticketActivity(ticket.id).slice(-20);
  return [
    `${ticket.key}: ${ticket.title}`,
    `Workspace: ${project?.name ?? "Unknown"}`,
    `Status: ${ticket.status}`,
    `Priority: ${ticket.priority}`,
    ticket.assigneeAgentId ? `Assignee: ${getAgent(ticket.assigneeAgentId)?.name ?? ticket.assigneeAgentId}` : "Assignee: Nobody",
    ticket.branch ? `Branch: ${ticket.branch}` : "",
    ticket.body ? `\nDescription:\n${ticket.body}` : "\nNo description.",
    children.length
      ? `\nSub-tickets:\n${children.map((child) => `- ${child.key} [${child.status}] ${child.title}`).join("\n")}`
      : "",
    activity.length
      ? `\nRecent activity:\n${activity.map((entry) => `- ${entry.actor} ${entry.kind}${entry.body ? `: ${entry.body}` : ""}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n");
}

export function ticketPromptContext(chatId: string): string | undefined {
  const ticket = ticketForChat(chatId);
  if (!ticket) return undefined;
  return `<remy_ticket_context>\n${describe(ticket)}\n\nThis thread is linked to this ticket. Use the Remy ticket tools to keep the ticket accurate as the work changes.\n</remy_ticket_context>`;
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function workspaceName(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  return basename(trimmed === "~" ? homedir() : trimmed) || "Workspace";
}

async function workspacePath(reference: string | undefined, currentCwd: string): Promise<string> {
  if (!reference?.trim()) return currentCwd;
  const asked = reference.trim();
  const workspaces = await listWorkspaces();
  const matches = workspaces.filter((workspace) =>
    workspace.id === asked
    || workspace.path === asked
    || workspace.origin === asked
    || workspace.name.toLowerCase() === asked.toLowerCase());
  if (matches.length === 0) throw new Error(`No workspace called ${asked}. Register it first if this is a new folder.`);
  if (matches.length > 1) throw new Error(`More than one workspace is called ${asked}. Use its id or path.`);
  return matches[0].path;
}

function describeThread(thread: ThreadDetail): string {
  const agent = thread.agentId ? getAgent(thread.agentId) : undefined;
  const recent = thread.entries.slice(-20).map((entry) => {
    if (entry.text) return `- ${entry.kind}: ${entry.text}`;
    return `- ${entry.kind}: ${[entry.verb, entry.arg, entry.status].filter(Boolean).join(" ")}`;
  });
  return [
    `${thread.title} (${thread.id})`,
    `State: ${thread.state}`,
    `Workspace folder: ${thread.cwd}`,
    `Provider: ${thread.provider}${thread.model ? ` / ${thread.model}` : ""}`,
    agent ? `Agent: @${agent.handle}` : "Agent: Workspace agent",
    thread.preview ? `Latest: ${thread.preview}` : "",
    recent.length ? `\nRecent thread activity:\n${recent.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

export function claudeTicketMcpServer(chatId: string, agentId: string | undefined, threads: RemyThreadControl) {
  const key = z.string().optional().describe("Ticket key. Omit it for this thread's linked ticket.");
  return createSdkMcpServer({
    name: "remy",
    version: "1",
    instructions: REMY_TOOL_INSTRUCTIONS,
    tools: [
      tool(
        "list_workspaces",
        "List the workspace folders registered on this machine.",
        {},
        async () => {
          const workspaces = await listWorkspaces();
          return ok(workspaces.length
            ? workspaces.map((workspace) => `${workspace.name} (${workspace.id})\n${workspace.path}${workspace.origin ? `\n${workspace.origin}` : ""}`).join("\n\n")
            : "No workspaces are registered on this machine.");
        },
        { annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
      ),
      tool(
        "register_workspace",
        "Register an existing Git repository folder as a Remy workspace.",
        {
          path: z.string().describe("Absolute or home-relative path to the repository folder"),
          name: z.string().max(80).optional().describe("Workspace name. Defaults to the folder name."),
        },
        async ({ path, name }) => {
          const workspace = await addWorkspace(name?.trim() || workspaceName(path), path);
          return ok(`Registered ${workspace.name} at ${workspace.path}.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      tool(
        "list_agents",
        "List the agents available when starting a thread.",
        {},
        async () => {
          const agents = listAgents();
          return ok(agents.length
            ? agents.map((agent) => `@${agent.handle}: ${agent.role || agent.name}`).join("\n")
            : "No custom agents are available. Use the workspace agent.");
        },
        { annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
      ),
      tool(
        "list_threads",
        "List recent Remy threads and their current state.",
        {},
        async () => ok(threads.list().slice(0, 50).map((thread) => {
          const owner = thread.agentId ? getAgent(thread.agentId)?.handle : undefined;
          return `${thread.id} [${thread.state}] ${thread.title}\n${thread.cwd}${owner ? `\n@${owner}` : ""}`;
        }).join("\n\n") || "There are no threads on this machine."),
        { annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
      ),
      tool(
        "read_thread",
        "Read a Remy thread's state and recent activity.",
        { thread_id: z.string().describe("The thread id from list_threads or start_thread") },
        async ({ thread_id }) => {
          const thread = threads.read(thread_id);
          if (!thread) throw new Error("No such thread.");
          return ok(describeThread(thread));
        },
        { annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
      ),
      tool(
        "start_thread",
        "Start another Remy thread and send it its first message.",
        {
          prompt: z.string().min(1).max(20000).describe("The complete task for the new thread"),
          workspace: z.string().optional().describe("Registered workspace name, id, path, or origin. Omit it to use this thread's folder."),
          agent: z.string().optional().describe("Agent handle. Omit it to use the workspace agent."),
          title: z.string().max(120).optional(),
          provider: z.enum(["claude", "codex"]).optional(),
          model: z.string().optional(),
        },
        async ({ prompt, workspace, agent, title, provider, model }) => {
          const selected = agent ? agentByHandle(agent.replace(/^@/, "")) : undefined;
          if (agent && !selected) throw new Error(`No agent called ${agent}.`);
          const thread = await threads.start({
            cwd: await workspacePath(workspace, threads.currentCwd),
            prompt,
            ...(title ? { title } : {}),
            ...(selected ? { agentId: selected.id } : {}),
            ...(provider ? { provider } : {}),
            ...(model ? { model } : {}),
          });
          return ok(`Started ${thread.title} as thread ${thread.id}.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
      ),
      tool(
        "send_to_thread",
        "Send another message to an existing Remy thread.",
        {
          thread_id: z.string(),
          message: z.string().min(1).max(20000),
        },
        async ({ thread_id, message }) => {
          if (thread_id === chatId) throw new Error("Reply normally instead of sending a message to this same thread.");
          await threads.send(thread_id, message);
          return ok(`Sent the message to thread ${thread_id}.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
      ),
      tool(
        "stop_thread",
        "Stop an existing Remy thread while keeping its conversation.",
        { thread_id: z.string() },
        async ({ thread_id }) => {
          if (thread_id === chatId) throw new Error("The current thread cannot stop itself through Remy.");
          threads.stop(thread_id);
          return ok(`Stopped thread ${thread_id}.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
      ),
      tool(
        "read_ticket",
        "Read a ticket's current scope, status, sub-tickets, and recent activity.",
        { key },
        async ({ key: asked }) => ok(describe(ticketFor(asked, chatId))),
        { annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
      ),
      tool(
        "attach_ticket",
        "Link this thread to a ticket before working on it.",
        { key: z.string().describe("The ticket key to work on") },
        async ({ key: asked }) => {
          const ticket = ticketFor(asked, chatId);
          const existing = ticketForChat(chatId);
          if (existing && existing.id !== ticket.id) throw new Error(`This thread is already linked to ${existing.key}.`);
          const linked = existing ?? linkThread(ticket.id, { chatId, agentId, linkedBy: "runner" });
          syncTicketFromThread(chatId, "working");
          return ok(`Linked this thread to ${linked.key}.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      tool(
        "update_ticket",
        "Rewrite a ticket's title or product scope.",
        {
          key,
          title: z.string().max(200).optional(),
          body: z.string().max(20000).optional().describe("The complete replacement description in markdown"),
        },
        async ({ key: asked, title, body }) => {
          const ticket = ticketFor(asked, chatId);
          const patch: Record<string, unknown> = {};
          if (title !== undefined) patch.title = title;
          if (body !== undefined) patch.body = body;
          if (Object.keys(patch).length === 0) throw new Error("Give a title or description to update.");
          return ok(`Updated ${updateTicket(ticket.id, patch).key}.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      tool(
        "set_ticket_status",
        "Move a ticket when its real work state changes.",
        {
          key,
          status: z.enum(TICKET_STATUSES as [TicketStatus, ...TicketStatus[]]),
          note: z.string().max(10000).optional(),
        },
        async ({ key: asked, status, note }) => {
          const ticket = ticketFor(asked, chatId);
          const actor = agentId ? getAgent(agentId)?.handle ?? "remy" : "remy";
          return ok(`Moved ${setTicketStatus(ticket.id, status, { actor, note }).key} to ${status}.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
      tool(
        "comment_on_ticket",
        "Record a concise progress note, QA result, blocker, or decision on a ticket.",
        { key, body: z.string().max(10000) },
        async ({ key: asked, body }) => {
          const ticket = ticketFor(asked, chatId);
          const actor = agentId ? getAgent(agentId)?.handle ?? "remy" : "remy";
          return ok(`Commented on ${commentOnTicket(ticket.id, body, actor).key}.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
      ),
      tool(
        "create_sub_ticket",
        "Create a smaller piece of work beneath a ticket.",
        {
          key,
          title: z.string().max(200),
          body: z.string().max(20000).optional(),
        },
        async ({ key: asked, title, body }) => {
          const parent = ticketFor(asked, chatId);
          const child = createTicket({
            projectId: parent.projectId,
            parentId: parent.id,
            title,
            ...(body ? { body } : {}),
          });
          return ok(`Created ${child.key} under ${parent.key}.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
      ),
      tool(
        "handoff_ticket",
        "Assign a ticket to one of this agent's configured handoff targets.",
        { key, handle: z.string().describe("The next agent's handle") },
        async ({ key: asked, handle }) => {
          const ticket = ticketFor(asked, chatId);
          const current = agentId ? getAgent(agentId) : undefined;
          const next = agentByHandle(handle);
          if (!next) throw new Error(`No agent called @${handle}.`);
          if (!current?.handoffTo.includes(next.handle)) throw new Error(`@${current?.handle ?? "workspace"} cannot hand tickets to @${next.handle}.`);
          const handed = handoffTicket(ticket.id, next.id, current.handle);
          setTicketStatus(handed.id, "todo", { actor: current.handle });
          return ok(`Handed ${handed.key} to @${next.handle} in Todo.`);
        },
        { annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      ),
    ],
  });
}
