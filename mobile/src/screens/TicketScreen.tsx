import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { color, radius, space, type } from "../theme";
import { apiError } from "../lib/api-error";
import { STATUS_LABEL } from "../lib/tickets";
import { useStore } from "../state/store";
import { Button } from "../components/Button";
import { EmptyState } from "../components/Empty";
import type { TicketStatus } from "../state/types";

const STATUSES = Object.keys(STATUS_LABEL) as TicketStatus[];

export function TicketScreen({ ticketKey, onOpenThread }: { ticketKey: string; onOpenThread: (id: string) => void }) {
  const ticket = useStore((s) => s.tickets.find((entry) => entry.key === ticketKey));
  const loadBoard = useStore((s) => s.loadBoard);
  const moveTicket = useStore((s) => s.moveTicket);
  const commentOnTicket = useStore((s) => s.commentOnTicket);
  const ticketActivity = useStore((s) => s.ticketActivity);
  const [body, setBody] = useState("");
  const [activity, setActivity] = useState<{ id: string; at: number; actor: string; kind: string; body?: string }[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!ticket) void loadBoard().catch(() => {});
  }, [ticket, loadBoard]);

  useEffect(() => {
    if (!ticket) return;
    void ticketActivity(ticket.id).then(setActivity).catch(() => {});
  }, [ticket, ticketActivity]);

  if (!ticket) {
    return (
      <View style={styles.wrap}>
        <EmptyState title="No such ticket" detail={`${ticketKey} is not on this board.`} />
      </View>
    );
  }

  const comment = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await commentOnTicket(ticket.id, trimmed);
      setBody("");
      setActivity(await ticketActivity(ticket.id));
    } catch (caught) {
      setError(apiError(caught));
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={type.caption}>{ticket.key}</Text>
      <Text style={type.title}>{ticket.title}</Text>
      {ticket.body ? <Text style={type.body}>{ticket.body}</Text> : null}
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
        {STATUSES.filter((status) => status !== "cancelled").map((status) => (
          <Pressable
            key={status}
            onPress={() => void moveTicket(ticket.id, status)}
            style={[styles.chip, ticket.status === status && styles.chipOn]}
          >
            <Text style={[styles.chipLabel, ticket.status === status && { color: color.primaryForeground }]}>
              {STATUS_LABEL[status]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {ticket.threads.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={type.caption}>Threads</Text>
          {ticket.threads.map((thread) => (
            <Pressable key={thread.chatId} onPress={() => onOpenThread(thread.chatId)} style={styles.link}>
              <Text style={type.callout}>Open thread</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {activity.map((item) => (
        <View key={item.id} style={styles.event}>
          <Text style={type.caption}>
            {item.actor} · {item.kind}
          </Text>
          {item.body ? <Text style={type.callout}>{item.body}</Text> : null}
        </View>
      ))}
      {error ? <Text style={{ color: color.destructive }}>{error}</Text> : null}
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Comment on this ticket"
        placeholderTextColor={color.mutedForeground}
        style={styles.input}
        multiline
      />
      <Button label="Add comment" disabled={!body.trim()} onPress={() => void comment()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.background },
  content: { padding: space.lg, gap: space.md, paddingBottom: 40 },
  chip: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: color.card,
  },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  chipLabel: { fontSize: 13, color: color.foreground },
  link: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: 12,
    backgroundColor: color.card,
  },
  event: { gap: 4 },
  input: {
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.card,
    borderRadius: radius.lg,
    padding: 12,
    minHeight: 72,
    color: color.foreground,
  },
});
