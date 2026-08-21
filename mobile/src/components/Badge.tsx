import { StyleSheet, Text, View } from "react-native";
import { color, radius } from "../theme";
import type { ChatState } from "../state/types";

const TONE: Record<ChatState, { bg: string; fg: string; label: string }> = {
  needs_input: { bg: "rgba(251,191,36,0.18)", fg: color.warning, label: "Needs you" },
  working: { bg: "rgba(96,165,250,0.18)", fg: color.info, label: "Working" },
  error: { bg: "rgba(248,113,113,0.18)", fg: color.destructive, label: "Error" },
  idle: { bg: color.muted, fg: color.mutedForeground, label: "Idle" },
};

export function StateBadge({ state }: { state: ChatState }) {
  if (state === "idle") return null;
  const tone = TONE[state];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.label, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

export function StateDot({ state }: { state: ChatState }) {
  const tone = TONE[state];
  return <View style={[styles.dot, { backgroundColor: state === "idle" ? "rgba(255,255,255,0.35)" : tone.fg }]} />;
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  label: { fontSize: 11, fontWeight: "600" },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
