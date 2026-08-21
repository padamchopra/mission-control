import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { color, radius, space } from "../theme";
import { DEVICE_ICON_IDS, deviceIcon, type DeviceIconId } from "../lib/devices";
import { TINT_IDS, tintOf, type TintId } from "../lib/tints";

export function DeviceIconSheet({
  open,
  icon,
  tint,
  onClose,
  onChange,
}: {
  open: boolean;
  icon: DeviceIconId;
  tint?: TintId;
  onClose: () => void;
  onChange: (patch: { icon?: DeviceIconId; tint?: TintId }) => void;
}) {
  const selected = tint ?? "zinc";
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.tints}>
            {TINT_IDS.map((id) => {
              const swatch = tintOf(id);
              return (
                <Pressable
                  key={id}
                  onPress={() => onChange({ tint: id })}
                  accessibilityLabel={id === "zinc" ? "Default tint" : `${id} tint`}
                  style={[styles.swatch, { backgroundColor: swatch.fg }]}
                >
                  {selected === id ? <Check size={10} color="#111" /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.grid}>
            {DEVICE_ICON_IDS.map((id) => {
              const Icon = deviceIcon(id);
              const on = id === icon;
              return (
                <Pressable
                  key={id}
                  onPress={() => onChange({ icon: id })}
                  accessibilityLabel={id}
                  style={[styles.glyph, on && styles.glyphOn]}
                >
                  <Icon size={18} color={color.foreground} />
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: space.xl,
  },
  sheet: {
    backgroundColor: color.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    gap: space.md,
  },
  tints: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphOn: { backgroundColor: color.accent },
});
