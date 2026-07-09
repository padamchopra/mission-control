#!/bin/bash
# One-shot setup for the Mac mini. Idempotent — safe to re-run after git pull.
#
#   git clone <repo> ~/Documents/Projects/mission-control   (or pull)
#   cd ~/Documents/Projects/mission-control && ./deploy/setup-mini.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"
MC_DIR="$HOME/.mission-control"
PLIST_LABEL="dev.raccoons.mission-control"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

for bin in node npm tmux curl; do
  command -v "$bin" >/dev/null || { echo "missing dependency: $bin"; exit 1; }
done

echo "==> Building server"
cd "$SERVER_DIR"
npm install --no-fund --no-audit
npm run build

echo "==> Installing hook script"
mkdir -p "$MC_DIR"
cp "$SERVER_DIR/hooks/mc-hook.sh" "$MC_DIR/mc-hook.sh"
chmod +x "$MC_DIR/mc-hook.sh"

echo "==> Registering Claude Code hooks (gated on TICKET_BOT=1)"
node - <<'EOF'
const fs = require("fs");
const path = require("path");
const settingsPath = path.join(process.env.HOME, ".claude", "settings.json");
const hookCmd = (event) => `$HOME/.mission-control/mc-hook.sh ${event}`;
const events = ["SessionStart", "UserPromptSubmit", "Notification", "Stop"];

const settings = fs.existsSync(settingsPath)
  ? JSON.parse(fs.readFileSync(settingsPath, "utf8"))
  : {};
settings.hooks = settings.hooks ?? {};
for (const event of events) {
  const groups = (settings.hooks[event] = settings.hooks[event] ?? []);
  const already = groups.some((g) =>
    (g.hooks ?? []).some((h) => String(h.command ?? "").includes("mc-hook.sh")),
  );
  if (!already) {
    groups.push({ hooks: [{ type: "command", command: hookCmd(event) }] });
    console.log(`   + ${event}`);
  }
}
fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
EOF

echo "==> Installing launchd service"
NODE_BIN="$(command -v node)"
mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|__NODE__|$NODE_BIN|g" \
    -e "s|__SERVER_DIR__|$SERVER_DIR|g" \
    -e "s|__HOME__|$HOME|g" \
    "$REPO_DIR/deploy/$PLIST_LABEL.plist" > "$PLIST_PATH"
launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl kickstart -k "gui/$(id -u)/$PLIST_LABEL"

sleep 2
TOKEN="$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.mission-control/config.json","utf8")).token' 2>/dev/null || echo "<server did not start — check ~/.mission-control/server.log>")"
PORT="$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.mission-control/config.json","utf8")).port' 2>/dev/null || echo 8420)"
TS_HOST="$(tailscale status --json 2>/dev/null | node -p 'try { JSON.parse(require("fs").readFileSync(0,"utf8")).Self.DNSName.replace(/\.$/,"") } catch { "<tailscale hostname>" }' 2>/dev/null || echo "<tailscale hostname>")"

if curl -s -m 3 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/health" | grep -q '"ok":true'; then
  HEALTH="healthy"
else
  HEALTH="NOT RESPONDING — check ~/.mission-control/server.log"
fi

cat <<SUMMARY

============================================================
Mission Control server: $HEALTH

iOS app settings:
  Server URL : http://$TS_HOST:$PORT
  Token      : $TOKEN

Remaining manual steps:
  1. Spawner: launch ticket sessions with TICKET_BOT=1 in the
     environment, e.g.
       tmux new-session -d -s "\$TICKET" "TICKET_BOT=1 claude ..."
     (hooks stay silent in every other session)
  2. Turn off remote control in the spawner's claude settings
     (remoteControlAtStartup: false) once the app is on your phone.
============================================================
SUMMARY
