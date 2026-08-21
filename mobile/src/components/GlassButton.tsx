import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { color } from "../theme";

function glassAvailable() {
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

export function GlassButton({
  onPress,
  accessibilityLabel,
  children,
  style,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const glass = glassAvailable();
  const body = (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
  if (!glass) {
    return <View style={[styles.wrap, styles.fallback, style]}>{body}</View>;
  }
  return (
    <GlassView style={[styles.wrap, style]} glassEffectStyle="regular" colorScheme="dark" isInteractive>
      {body}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
  },
  fallback: {
    backgroundColor: "rgba(38,38,38,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  hit: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
});
