import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, space, type } from "../theme";

export function EmptyState({
  title,
  detail,
  icon,
  action,
  compact,
}: {
  title: string;
  detail: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={type.title}>{title}</Text>
      <Text style={[type.body, styles.detail]}>{detail}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignSelf: "stretch",
    backgroundColor: color.background,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.sm,
  },
  compact: {
    flex: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: color.muted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  detail: { color: color.mutedForeground, textAlign: "center" },
  action: { marginTop: space.md },
});
