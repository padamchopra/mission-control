import { dmChatFor, postToChat } from "./chat.js";
import { getKv, setKv } from "./db.js";
import { REMY_AGENT_ID } from "./remy-agent.js";
import { seedRemyAgent } from "./agents.js";

/// What Remy says for itself, in its own conversation.
///
/// Each release that changes something worth knowing adds an entry to the end
/// of this list and never edits or removes an earlier one — an id that has been
/// delivered must keep meaning the same thing.

interface Announcement {
  /// Stable forever. Delivery is remembered by id, so renaming one delivers it
  /// again to everybody.
  id: string;
  /// Which release introduced it. Documentation: nothing compares versions,
  /// because what matters is whether this machine has seen this message.
  version: string;
  text: string;
}

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "hello",
    version: "0.1",
    text: [
      "Hi, I'm Remy.",
      "",
      "Ask me to write a ticket, add a workspace, or start a thread somewhere, and I'll do it from here. Ask me how something in Remy works and I'll tell you.",
    ].join("\n"),
  },
];

const DELIVERED = "announcementsDelivered";

function delivered(): string[] | undefined {
  const stored = getKv<unknown>(DELIVERED);
  return Array.isArray(stored) ? stored.map(String) : undefined;
}

/// Posts whatever Remy has not said on this machine yet.
///
/// A machine that has never had this run is a fresh install, and somebody who
/// installs Remy after ten releases should not open the inbox to ten messages.
/// So the first run delivers the greeting alone and marks the rest as said;
/// every release after that lands one message, when it lands.
///
/// The greeting is the first entry rather than a case of its own: what a new
/// install needs is one message that says what Remy is, and that is what the
/// first entry has always been.
export function deliverAnnouncements(): void {
  const seen = delivered();
  const all = ANNOUNCEMENTS.map((entry) => entry.id);
  const due = seen === undefined
    ? ANNOUNCEMENTS.slice(0, 1)
    : ANNOUNCEMENTS.filter((entry) => !seen.includes(entry.id));
  // Nothing to say and nothing to record: an inbox is not opened on Remy's
  // behalf, so a machine with no news never grows a conversation it never used.
  if (due.length === 0 && seen !== undefined && all.every((id) => seen.includes(id))) return;

  try {
    seedRemyAgent();
    const dm = dmChatFor(REMY_AGENT_ID);
    for (const entry of due) postToChat(dm.id, entry.text);
    setKv(DELIVERED, all);
  } catch (error) {
    // A message Remy could not post is worth another boot, so nothing is
    // recorded as delivered. The inbox is not worth failing a start-up over.
    console.error("could not post Remy's messages:", error);
  }
}
