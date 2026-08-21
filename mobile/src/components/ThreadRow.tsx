import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "../theme";
import { displayPath, plainText } from "../lib/path";
import type { Chat } from "../state/types";
import { StateBadge, StateDot } from "./Badge";

export function ThreadRow({
  chat,
  onPress,
  machine,
}: {
  chat: Chat;
  onPress: () => void;
  machine?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.header}>
        <StateDot state={chat.state} />
        <Text style={[type.callout, styles.title]} numberOfLines={1}>
          {chat.title}
        </Text>
        <StateBadge state={chat.state} />
      </View>
      {chat.preview ? (
        <Text style={styles.preview} numberOfLines={2}>
          {plainText(chat.preview)}
        </Text>
      ) : null}
      <Text style={type.mono} numberOfLines={1}>
        {machine ? `${machine} · ${displayPath(chat.cwd)}` : displayPath(chat.cwd)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.xl,
    padding: space.md,
    gap: 6,
  },
  pressed: { backgroundColor: color.accent },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flex: 1, fontWeight: "600" },
  preview: { color: color.mutedForeground, fontSize: 13, lineHeight: 18 },
});
