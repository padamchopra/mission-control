import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { color, radius, space, type } from "../theme";
import { hostLabel } from "../lib/pairing";
import { useStore } from "../state/store";
import type { Server } from "../state/types";
import type { DeviceIconId } from "../lib/devices";
import type { TintId } from "../lib/tints";
import { Button } from "../components/Button";
import { DeviceMark } from "../components/DeviceMark";
import { DeviceIconSheet } from "../components/DeviceIconSheet";
import { EditableName } from "../components/EditableName";

export function DevicesScreen({
  onPairAnother,
  onUnpair,
}: {
  onPairAnother: () => void;
  onUnpair: (url: string) => void;
}) {
  const servers = useStore((s) => s.servers);
  const updateServer = useStore((s) => s.updateServer);
  const [picking, setPicking] = useState<Server>();

  const unpair = (server: Server) => {
    Alert.alert(`Unpair ${server.name}?`, "This phone stops talking to it until you pair again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Unpair", style: "destructive", onPress: () => onUnpair(server.url) },
    ]);
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      {servers.map((server) => (
        <View key={server.id} style={styles.card}>
          <DeviceMark server={server} onPress={() => setPicking(server)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <EditableName
              value={server.name}
              label="device name"
              onCommit={(name) => void updateServer(server.id, { name })}
            />
            <Text style={type.caption} numberOfLines={1}>
              {server.code} · {hostLabel(server.url)}
            </Text>
          </View>
          {server.home ? (
            <Button label="Unpair" variant="ghost" onPress={() => unpair(server)} style={styles.unpair} />
          ) : null}
        </View>
      ))}
      <Button label="Pair another Mac" variant="outline" onPress={onPairAnother} />
      {picking ? (
        <DeviceIconSheet
          open
          icon={picking.icon}
          tint={picking.tint}
          onClose={() => setPicking(undefined)}
          onChange={(patch: { icon?: DeviceIconId; tint?: TintId }) => {
            void updateServer(picking.id, patch);
            setPicking((current) => (current ? { ...current, ...patch } : current));
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.background },
  content: { padding: space.lg, gap: space.md, paddingBottom: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: 12,
  },
  unpair: { minHeight: 32, paddingHorizontal: 8 },
});
