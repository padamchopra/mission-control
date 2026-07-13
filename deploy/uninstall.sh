#!/bin/bash
# Reverses deploy/setup.sh: stops the server, removes the LaunchAgent, the
# ~/.mission-control directory, the Claude Code hook entries, and the
# tailscale serve rule. Leaves dependency tools (node, tmux, qrencode,
# Tailscale) and this repo checkout in place.
set -euo pipefail

MC_DIR="$HOME/.mission-control"
PLIST_LABEL="com.example.missioncontrol"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

echo "==> Stopping and removing launchd service"
launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
rm -f "$PLIST_PATH"

echo "==> Removing tailscale serve rule"
TAILSCALE="$(command -v tailscale || true)"
for candidate in /Applications/Tailscale.app/Contents/MacOS/Tailscale "$HOME/Applications/Tailscale.app/Contents/MacOS/Tailscale"; do
  [ -n "$TAILSCALE" ] && break
  [ -x "$candidate" ] && TAILSCALE="$candidate"
done
if [ -n "$TAILSCALE" ]; then
  # setup.sh owned the whole serve config (it ran `serve reset` before adding
  # its rule), so resetting here clears only what setup added.
  "$TAILSCALE" serve reset 2>/dev/null || true
else
  echo "    tailscale CLI not found — remove any serve rule manually (tailscale serve reset)"
fi

echo "==> Removing Claude Code hook entries"
node - <<'EOF' || echo "    couldn't update ~/.claude/settings.json — remove the mc-hook.sh entries manually"
const fs = require("fs");
const path = require("path");
const settingsPath = path.join(process.env.HOME, ".claude", "settings.json");
if (!fs.existsSync(settingsPath)) process.exit(0);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
  const kept = groups.filter(
    (g) => !(g.hooks ?? []).some((h) => String(h.command ?? "").includes("mc-hook.sh")),
  );
  if (kept.length !== groups.length) console.log(`   - ${event}`);
  if (kept.length === 0) delete settings.hooks[event];
  else settings.hooks[event] = kept;
}
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
EOF

echo "==> Removing $MC_DIR (config, token, hook script, uploads, logs)"
rm -rf "$MC_DIR"

cat <<SUMMARY

Mission Control has been removed from this Mac. Left in place:
  - this repo checkout (delete it yourself if you're done with it)
  - dependency tools (node, tmux, qrencode, Tailscale)
  - any tmux sessions that are still running
On the phone, remove this server from the app (or delete the app).
SUMMARY
