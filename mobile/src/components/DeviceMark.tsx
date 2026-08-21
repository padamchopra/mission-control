import { Pressable, StyleSheet, View } from "react-native";
import { color, radius } from "../theme";
import { deviceIcon } from "../lib/devices";
import { tintOf } from "../lib/tints";
import type { Server } from "../state/types";

export function DeviceMark({
  server,
  onPress,
}: {
  server: Server;
  onPress?: () => void;
}) {
  const Icon = deviceIcon(server.icon);
  const colors = tintOf(server.tint);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={onPress ? `Change icon for ${server.name}` : undefined}
      style={[styles.well, { backgroundColor: colors.well }]}
    >
      <Icon size={18} color={colors.fg} />
      <View
        style={[
          styles.dot,
          { backgroundColor: server.online ? color.success : color.mutedForeground },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  well: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: color.card,
  },
});
