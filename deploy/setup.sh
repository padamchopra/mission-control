#!/bin/bash
# One-shot setup for the Mac (server side). Idempotent — safe to re-run after git pull.
#
#   git clone <repo> ~/Documents/Projects/mission-control   (or pull)
#   cd ~/mission-control && ./deploy/setup.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"
MC_DIR="$HOME/.mission-control"
PLIST_LABEL="com.example.missioncontrol"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

for bin in node npm tmux curl; do
  command -v "$bin" >/dev/null || { echo "missing dependency: $bin"; exit 1; }
done

# The macOS Tailscale GUI app doesn't put its CLI on PATH — find it.
TAILSCALE="$(command -v tailscale || true)"
for candidate in /Applications/Tailscale.app/Contents/MacOS/Tailscale "$HOME/Applications/Tailscale.app/Contents/MacOS/Tailscale"; do
  [ -n "$TAILSCALE" ] && break
  [ -x "$candidate" ] && TAILSCALE="$candidate"
done
[ -n "$TAILSCALE" ] || { echo "Tailscale not found — install it and sign in first."; exit 1; }

if ! command -v qrencode >/dev/null; then
  echo "==> Installing qrencode (for pairing QR)"
  brew install qrencode
fi

echo "==> Building server"
cd "$SERVER_DIR"
npm install --no-fund --no-audit
npm run build

echo "==> Installing hook script"
mkdir -p "$MC_DIR"
cp "$SERVER_DIR/hooks/mc-hook.sh" "$MC_DIR/mc-hook.sh"
chmod +x "$MC_DIR/mc-hook.sh"

echo "==> Registering Claude Code hooks (every tmux Claude session reports)"
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
TS_HOST="$("$TAILSCALE" status --json 2>/dev/null | node -p 'try { JSON.parse(require("fs").readFileSync(0,"utf8")).Self.DNSName.replace(/\.$/,"") } catch { "<tailscale hostname>" }' 2>/dev/null || echo "<tailscale hostname>")"
NTFY_SERVER="$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.mission-control/config.json","utf8")).ntfyServer' 2>/dev/null || echo "https://ntfy.sh")"
NTFY_TOPIC="$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.mission-control/config.json","utf8")).ntfyTopic' 2>/dev/null || echo "<ntfy topic>")"

if curl -s -m 3 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/health" | grep -q '"ok":true'; then
  HEALTH="healthy"
else
  HEALTH="NOT RESPONDING — check ~/.mission-control/server.log"
fi

# The node server is bound to 127.0.0.1 only. `tailscale serve` (NOT funnel) is
# the sole path in from outside — tailnet devices only, TLS-terminated. Prefer
# HTTPS; fall back to tailnet-HTTP if the tailnet hasn't enabled HTTPS certs
# (still WireGuard-encrypted and tailnet-only, just no TLS-on-top).
echo "==> Exposing over the tailnet with tailscale serve"
"$TAILSCALE" serve reset >/dev/null 2>&1 || true
if "$TAILSCALE" serve --bg --https=443 "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
  APP_URL="https://$TS_HOST"
  SERVE_NOTE="HTTPS (TLS, tailnet-only)"
elif "$TAILSCALE" serve --bg --http="$PORT" "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
  APP_URL="http://$TS_HOST:$PORT"
  SERVE_NOTE="tailnet HTTP (WireGuard-encrypted, tailnet-only). Enable HTTPS certs in the Tailscale admin console for TLS, then re-run."
else
  APP_URL="http://$TS_HOST:$PORT"
  SERVE_NOTE="tailscale serve FAILED — the app cannot reach the server until this is fixed (see: tailscale serve status)."
fi

# Persist the pairing values so deploy/show-pairing.sh can reprint the QR later.
cat > "$MC_DIR/pairing.env" <<PAIRING
APP_URL=$APP_URL
TOKEN=$TOKEN
PAIRING
chmod 600 "$MC_DIR/pairing.env"

PAIR_LINK="missioncontrol://configure?url=$APP_URL&token=$TOKEN"

cat <<SUMMARY

============================================================
Mission Control server: $HEALTH
Tailnet exposure:        $SERVE_NOTE

Pair the app: open Settings → "Scan pairing QR" and scan this:
============================================================
SUMMARY

qrencode -t ANSIUTF8 -m 2 "$PAIR_LINK"

cat <<SUMMARY
============================================================
Or enter manually:
  Server URL : $APP_URL
  Token      : $TOKEN

Reprint this QR anytime:  ./deploy/show-pairing.sh

Notifications (ntfy) — install the "ntfy" app on your phone, add
server $NTFY_SERVER, and subscribe to topic:
  $NTFY_TOPIC
Notifications tap through to the session in Mission Control.

Once the app is on your phone, turn off Claude Code remote control
(remoteControlAtStartup: false) — Mission Control replaces it.
============================================================
SUMMARY
