import { Inbox } from "lucide-react-native";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { color, space } from "../theme";
import { useStore } from "../state/store";
import { EmptyState } from "../components/Empty";
import { ThreadRow } from "../components/ThreadRow";

export function InboxScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const chats = useStore((s) => s.chats);
  const servers = useStore((s) => s.servers);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const refresh = useStore((s) => s.refresh);
  const inbox = chats.filter((chat) => chat.state === "needs_input");
  const named = servers.length > 1;

  if (!loading && inbox.length === 0) {
    return (
      <View style={styles.wrap}>
        <EmptyState
          icon={<Inbox size={22} color={color.mutedForeground} />}
          title={error ? (named ? "Can't reach your Macs" : "Can't reach this Mac") : "Inbox is clear"}
          detail={error ?? "Nothing is waiting on you."}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={color.foreground} />}
    >
      {inbox.map((chat) => (
        <ThreadRow
          key={`${chat.serverId}:${chat.id}`}
          chat={chat}
          machine={named ? servers.find((server) => server.id === chat.serverId)?.name : undefined}
          onPress={() => onOpen(chat.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.background },
  content: { padding: space.lg, gap: space.md, paddingBottom: 40 },
});
