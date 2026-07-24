#!/bin/bash
# Runs on the server Mac after an authenticated in-app update request. It keeps
# a tiny status file so the client can reconnect after launchd restarts Node.
set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"
MC_DIR="$HOME/.mission-control"
STATUS_FILE="$MC_DIR/update-status.json"
LOG_FILE="$MC_DIR/update.log"
LABEL="com.example.missioncontrol"

mkdir -p "$MC_DIR"

write_status() {
  node -e '
    const fs = require("fs");
    const [file, state, message] = process.argv.slice(1);
    fs.writeFileSync(file, JSON.stringify({ state, message, updatedAt: Date.now() }) + "\n", { mode: 0o600 });
  ' "$STATUS_FILE" "$1" "$2"
}

write_status "running" "Pulling latest changes"
{
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Mission Control update"
  cd "$REPO_DIR" && git pull --ff-only
} >>"$LOG_FILE" 2>&1

if [ $? -ne 0 ]; then
  write_status "failed" "Couldn't pull latest changes — the server clone may have local edits or a diverged branch. See ~/.mission-control/update.log on the server."
  exit 1
fi

write_status "running" "Installing dependencies and building"
{
  cd "$SERVER_DIR" && npm ci --no-fund --no-audit && npm run build
} >>"$LOG_FILE" 2>&1

if [ $? -ne 0 ]; then
  write_status "failed" "Build failed. See ~/.mission-control/update.log on the server."
  exit 1
fi

write_status "restarting" "Update installed; restarting server"
sleep 1
launchctl kickstart -k "gui/$(id -u)/$LABEL" >>"$LOG_FILE" 2>&1 || {
  write_status "failed" "Update installed, but the server restart failed. See update.log."
  exit 1
}
write_status "succeeded" "Server updated and restarted"
