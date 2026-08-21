import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Folder } from "lucide-react-native";
import { color, radius } from "../theme";
import { deviceIcon } from "../lib/devices";
import { isProjectIconFile, projectIcon } from "../lib/projects";
import { tintOf } from "../lib/tints";
import { useStore } from "../state/store";
import type { Server, Workspace } from "../state/types";

const cache = new Map<string, { mime: string; data: string }>();

export function WorkspaceMark({
  workspace,
  home = false,
  server,
  size = "lg",
}: {
  workspace?: Workspace;
  home?: boolean;
  server?: Server;
  size?: "sm" | "lg";
}) {
  const box = size === "lg" ? 28 : 16;
  const glyph = size === "lg" ? 16 : 12;
  if (home || !workspace) {
    const Icon = deviceIcon(server?.icon);
    return (
      <View collapsable={false} style={[styles.well, size === "lg" ? styles.lg : styles.sm]}>
        <Icon size={glyph} color={color.foreground} />
      </View>
    );
  }
  const colors = tintOf(workspace.tint);
  const Icon = projectIcon(workspace.icon);
  const file = isProjectIconFile(workspace.icon) ? workspace.icon : undefined;
  return (
    <View
      collapsable={false}
      style={[
        styles.well,
        size === "lg" ? styles.lg : styles.sm,
        { backgroundColor: colors.well, borderRadius: size === "lg" ? radius.md : 4 },
      ]}
    >
      {file ? (
        <WorkspaceFileIcon workspaceId={workspace.id} path={file} size={box} />
      ) : (
        <Icon size={glyph} color={colors.fg} />
      )}
    </View>
  );
}

function WorkspaceFileIcon({ workspaceId, path, size }: { workspaceId: string; path: string; size: number }) {
  const workspaceFile = useStore((s) => s.workspaceFile);
  const key = `${workspaceId}:${path}`;
  const [file, setFile] = useState(cache.get(key));

  useEffect(() => {
    const cached = cache.get(key);
    setFile(cached);
    if (cached) return;
    let cancelled = false;
    void workspaceFile(workspaceId, path).then((next) => {
      if (cancelled || !next) return;
      cache.set(key, next);
      setFile(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key, path, workspaceFile, workspaceId]);

  if (!file) return <Folder size={Math.round(size * 0.5)} color={color.mutedForeground} />;
  if (file.mime === "image/svg+xml" || path.toLowerCase().endsWith(".svg")) {
    const xml = decodeBase64(file.data);
    if (xml) return <SvgXml xml={xml} width={size} height={size} />;
  }
  return (
    <Image
      source={{ uri: `data:${file.mime};base64,${file.data}` }}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

function decodeBase64(data: string): string {
  try {
    const binary = atob(data);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  well: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  sm: { width: 16, height: 16 },
  lg: { width: 28, height: 28 },
});
