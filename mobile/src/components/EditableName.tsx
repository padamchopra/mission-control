import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Pencil } from "lucide-react-native";
import { color, radius, type } from "../theme";

export function EditableName({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(value);
      setEditing(false);
      return;
    }
    const next = draft.trim();
    setEditing(false);
    if (!next) {
      setDraft(value);
      return;
    }
    if (next !== value) onCommit(next);
  };

  if (editing) {
    return (
      <TextInput
        autoFocus
        value={draft}
        accessibilityLabel={label}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        selectTextOnFocus
        style={styles.input}
      />
    );
  }

  return (
    <View style={styles.row}>
      <Text style={[type.heading, styles.name]} numberOfLines={1}>
        {value}
      </Text>
      <Pressable
        onPress={() => {
          cancelled.current = false;
          setDraft(value);
          setEditing(true);
        }}
        hitSlop={8}
        accessibilityLabel={`Rename ${label}`}
      >
        <Pencil size={14} color={color.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  name: { flexShrink: 1 },
  input: {
    ...type.heading,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.input,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 80,
  },
});
