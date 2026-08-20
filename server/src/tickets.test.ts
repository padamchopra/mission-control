import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Every module here opens the shared database at import time, so the suite runs
// against a throwaway directory. node:test gives each file its own process, so
// this override cannot leak sideways.
const stateDir = mkdtempSync(join(tmpdir(), "mc-tickets-"));
process.env.MC_CONFIG_DIR = stateDir;

const { db } = await import("./db.js");
const log = await import("./board-log.js");
const projects = await import("./projects.js");
const tickets = await import("./tickets.js");
const agents = await import("./agents.js");

function project(name: string) {
  return projects.createProject({ name });
}

// ── ordering ────────────────────────────────────────────────────────────────

test("a rank always sorts between the two it was asked for", () => {
  const first = tickets.rankBetween();
  const before = tickets.rankBetween(undefined, first);
  const after = tickets.rankBetween(first);
  const middle = tickets.rankBetween(first, after);

  assert.ok(before < first, `${before} should sort before ${first}`);
  assert.ok(first < middle, `${first} should sort before ${middle}`);
  assert.ok(middle < after, `${middle} should sort before ${after}`);
});

test("ranks stay orderable when a card is dropped into the same gap repeatedly", () => {
  let low = tickets.rankBetween();
  const high = tickets.rankBetween(low);
  for (let i = 0; i < 50; i += 1) {
    const next = tickets.rankBetween(low, high);
    assert.ok(low < next && next < high, `${low} < ${next} < ${high} failed on pass ${i}`);
    low = next;
  }
});

// ── keys ────────────────────────────────────────────────────────────────────

test("keys are minted from the project prefix and never repeat", () => {
  const remy = project("Remy");
  const one = tickets.createTicket({ projectId: remy.id, title: "First" });
  const two = tickets.createTicket({ projectId: remy.id, title: "Second" });

  assert.equal(one.key, "REMY-1");
  assert.equal(two.key, "REMY-2");

  // A deleted ticket must not hand its number to the next one, or a link in an
  // old comment would point at different work.
  tickets.deleteTicket(two.id);
  const three = tickets.createTicket({ projectId: remy.id, title: "Third" });
  assert.equal(three.key, "REMY-3");
});

test("two projects get distinct prefixes even when their names collide", () => {
  const a = project("Atlas");
  const b = project("Atlas");
  assert.notEqual(a.keyPrefix, b.keyPrefix);
});

// ── status rules ────────────────────────────────────────────────────────────

test("a thread only moves a ticket between In progress and Needs input", () => {
  const board = project("Statuses");
  const ticket = tickets.createTicket({ projectId: board.id, title: "Flaky login test" });
  tickets.linkThread(ticket.id, { chatId: "chat-1" });

  // Backlog is not one of the derived pair, so a working thread leaves it be.
  tickets.syncTicketFromThread("chat-1", "working");
  assert.equal(tickets.getTicket(ticket.id)?.status, "backlog");

  tickets.setTicketStatus(ticket.id, "in_progress");
  tickets.syncTicketFromThread("chat-1", "needs_input");
  assert.equal(tickets.getTicket(ticket.id)?.status, "needs_input");

  tickets.syncTicketFromThread("chat-1", "working");
  assert.equal(tickets.getTicket(ticket.id)?.status, "in_progress");

  // An errored thread is something waiting on a person, not a finished ticket.
  tickets.syncTicketFromThread("chat-1", "error");
  assert.equal(tickets.getTicket(ticket.id)?.status, "needs_input");

  // What you set by hand is never dragged back by the next turn that ends.
  tickets.setTicketStatus(ticket.id, "done");
  tickets.syncTicketFromThread("chat-1", "working");
  assert.equal(tickets.getTicket(ticket.id)?.status, "done");
});

test("a status change records who made it", () => {
  const board = project("Actors");
  const ticket = tickets.createTicket({ projectId: board.id, title: "Who moved it" });
  tickets.setTicketStatus(ticket.id, "in_progress");
  tickets.linkThread(ticket.id, { chatId: "chat-actor" });
  tickets.syncTicketFromThread("chat-actor", "needs_input");

  const activity = tickets.ticketActivity(ticket.id);
  const derived = activity.filter((entry) => entry.kind === "status");
  assert.equal(derived.at(-1)?.actor, "remy");
  assert.equal(derived.at(-2)?.actor, "you");
});

// ── threads ─────────────────────────────────────────────────────────────────

test("a thread belongs to at most one ticket", () => {
  const board = project("Links");
  const first = tickets.createTicket({ projectId: board.id, title: "First" });
  const second = tickets.createTicket({ projectId: board.id, title: "Second" });

  tickets.linkThread(first.id, { chatId: "shared" });
  assert.throws(() => tickets.linkThread(second.id, { chatId: "shared" }), /already on/);

  // Detaching frees it, because a mis-attach should not be permanent.
  tickets.unlinkThread(first.id, "shared");
  const moved = tickets.linkThread(second.id, { chatId: "shared" });
  assert.equal(moved.threads.length, 1);
  assert.equal(tickets.ticketForChat("shared")?.id, second.id);
});

test("attaching a thread does not move the ticket by itself", () => {
  const board = project("Bookkeeping");
  const ticket = tickets.createTicket({ projectId: board.id, title: "Attach me" });
  const after = tickets.linkThread(ticket.id, { chatId: "chat-attach" });
  assert.equal(after.status, "backlog");
  assert.equal(after.threads[0].linkedBy, "you");
});

test("a deleted thread leaves the ticket and its story behind", () => {
  const board = project("Forget");
  const ticket = tickets.createTicket({ projectId: board.id, title: "Outlives its thread" });
  tickets.linkThread(ticket.id, { chatId: "chat-gone" });
  tickets.forgetChat("chat-gone");

  const after = tickets.getTicket(ticket.id);
  assert.equal(after?.threads.length, 0);
  assert.ok(
    tickets.ticketActivity(ticket.id).some((entry) => entry.kind === "link"),
    "the feed should still record that a thread worked on this",
  );
});

// ── the projection ──────────────────────────────────────────────────────────

test("a ticket projects the same whatever order its events arrive in", () => {
  const board = project("Convergence");
  const ticket = tickets.createTicket({ projectId: board.id, title: "Ordered" });
  tickets.setTicketStatus(ticket.id, "in_progress");
  tickets.updateTicket(ticket.id, { title: "Renamed once" });
  tickets.setTicketStatus(ticket.id, "in_review");
  const expected = tickets.getTicket(ticket.id);

  // Replay the same events with their rows shuffled. The fold sorts by
  // (lamport, deviceId, id), so insertion order must not matter — this is the
  // property a second machine depends on, since it receives events in whatever
  // order the network hands them over.
  const rows = db
    .prepare("select * from board_log where entity = 'ticket' and entity_id = ?")
    .all(ticket.id) as Record<string, string | number>[];
  const shuffled = [...rows].reverse();
  db.prepare("delete from board_log where entity = 'ticket' and entity_id = ?").run(ticket.id);
  const insert = db.prepare(
    `insert into board_log (id, device_id, lamport, at, entity, entity_id, kind, json)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const row of shuffled) {
    insert.run(row.id, row.device_id, row.lamport, row.at, row.entity, row.entity_id, row.kind, row.json);
  }
  const replayed = tickets.reproject(ticket.id);

  assert.ok(expected && replayed, "both projections should exist");
  const { threads: _threads, ...fields } = expected;
  assert.deepEqual(replayed, fields);
});

test("two machines editing the same field converge on the same answer", () => {
  const board = project("Peers");
  const ticket = tickets.createTicket({ projectId: board.id, title: "Contested" });

  // Two field events at the same lamport, from different devices — exactly what
  // a partition produces. The tie breaks on device id, so both machines fold to
  // the same title rather than each keeping its own.
  const insert = db.prepare(
    `insert into board_log (id, device_id, lamport, at, entity, entity_id, kind, json)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const at = Date.now();
  insert.run("evt-b", "device-b", 9999, at, "ticket", ticket.id, "field", JSON.stringify({ title: "From B" }));
  insert.run("evt-a", "device-a", 9999, at, "ticket", ticket.id, "field", JSON.stringify({ title: "From A" }));

  assert.equal(tickets.reproject(ticket.id)?.title, "From B", "the higher device id should win the tie");

  // And it stays that way however many times it is replayed.
  assert.equal(tickets.reproject(ticket.id)?.title, "From B");
});

test("every board write is an event, so nothing changes without a record", () => {
  const board = project("Auditing");
  const ticket = tickets.createTicket({ projectId: board.id, title: "Traceable" });
  const before = log.eventsFor("ticket", ticket.id).length;
  tickets.commentOnTicket(ticket.id, "A note for whoever picks this up");
  tickets.setTicketStatus(ticket.id, "todo");
  assert.equal(log.eventsFor("ticket", ticket.id).length, before + 2);
});

// ── agents ──────────────────────────────────────────────────────────────────

test("an agent handle is unique and usable in a tool call", () => {
  const first = agents.createAgent({ name: "Iris the Scout" });
  assert.equal(first.handle, "iris-the-scout");
  assert.throws(() => agents.createAgent({ name: "iris the scout" }), /already uses/);
  // Renaming to a free handle is fine; the clash check exempts the agent itself.
  const renamed = agents.updateAgent(first.id, { handle: "iris" });
  assert.equal(renamed.handle, "iris");
});

test("git identity modes decide which variables a thread gets", () => {
  const off = agents.createAgent({ name: "Quiet", gitIdentity: "off" });
  assert.deepEqual(agents.gitIdentityEnv(off), {});

  const author = agents.createAgent({ name: "Writer", gitIdentity: "author" });
  const authorEnv = agents.gitIdentityEnv(author);
  assert.equal(authorEnv.GIT_AUTHOR_NAME, "Writer");
  assert.equal(authorEnv.GIT_AUTHOR_EMAIL, "writer@remy.invalid");
  // Author-only deliberately leaves the human as committer.
  assert.equal(authorEnv.GIT_COMMITTER_NAME, undefined);

  const full = agents.createAgent({ name: "Both", gitIdentity: "full" });
  const fullEnv = agents.gitIdentityEnv(full);
  assert.equal(fullEnv.GIT_COMMITTER_NAME, "Both");
  assert.equal(fullEnv.GIT_COMMITTER_EMAIL, "both@remy.invalid");

  assert.deepEqual(agents.gitIdentityEnv(undefined), {}, "a thread with no agent keeps your identity");
});

test("an agent email has to be an address", () => {
  const agent = agents.createAgent({ name: "Picky" });
  assert.throws(() => agents.updateAgent(agent.id, { gitEmail: "not an address" }), /email address/);
  const ok = agents.updateAgent(agent.id, { gitEmail: "picky@example.com" });
  assert.equal(ok.gitEmail, "picky@example.com");
});

test("the built-in agents seed once and stay editable", () => {
  agents.seedPresetAgents();
  const first = agents.listAgents().filter((agent) => agent.preset).length;
  agents.seedPresetAgents();
  assert.equal(agents.listAgents().filter((agent) => agent.preset).length, first);
  assert.ok(first >= 4, "the four presets should be there");

  const builder = agents.agentByHandle("builder");
  assert.ok(builder, "builder should be seeded");
  assert.equal(builder.permissionMode, "acceptEdits");
  assert.equal(builder.gitIdentity, "author");
  const edited = agents.updateAgent(builder.id, { role: "Changed by hand" });
  assert.equal(edited.role, "Changed by hand");
});
