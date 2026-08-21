import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Laptop } from "lucide-react-native";
import { color, radius, space, type } from "../theme";
import { formatPairCode } from "../lib/pairing";
import { apiError } from "../lib/api-error";
import { useStore } from "../state/store";
import { Button } from "./Button";

export function PairRequestModal() {
  const requests = useStore((s) => s.pairRequests);
  const answerPair = useStore((s) => s.answerPair);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const request = requests[0];
  if (!request) return null;

  const decide = async (decision: "approve" | "deny") => {
    setBusy(true);
    setError(undefined);
    try {
      await answerPair(request.id, decision);
    } catch (caught) {
      setError(apiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible>
      <Pressable style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.heading}>
            <Laptop size={16} color={color.mutedForeground} />
            <Text style={type.heading}>{request.fromName} wants to pair</Text>
          </View>
          <Text style={[type.body, { color: color.mutedForeground }]}>
            Allow it only if this code matches the one on that Mac.
          </Text>
          <View style={styles.code}>
            <Text style={styles.digits}>{formatPairCode(request.code)}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Button label="Deny" variant="ghost" disabled={busy} onPress={() => void decide("deny")} />
            <Button label="Allow" busy={busy} onPress={() => void decide("approve")} />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  card: {
    width: "100%",
    backgroundColor: color.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    gap: space.md,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: space.sm },
  code: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    alignItems: "center",
    backgroundColor: color.muted,
  },
  digits: { fontFamily: "Menlo", fontSize: 28, letterSpacing: 6, color: color.foreground },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm },
  error: { color: color.destructive, fontSize: 13 },
});
