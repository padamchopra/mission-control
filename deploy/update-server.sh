#!/bin/bash
# Runs on the server after an authenticated in-app update request. It keeps
# status in remy.db so the client can reconnect after launchd restarts Node.
set -u

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"
# shellcheck source=config-dir.sh
. "$(dirname "$0")/config-dir.sh"
STORE="$REPO_DIR/server/scripts/store.mjs"
[ -f "$MC_DIR/store.mjs" ] && STORE="$MC_DIR/store.mjs"
LOG_FILE="$MC_DIR/update.log"
LABEL="com.example.remy"

mkdir -p "$MC_DIR"

write_status() {
  node "$STORE" set-update "$1" "$2"
}

write_status "running" "Pulling latest changes"
{
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Remy update"
  cd "$REPO_DIR" && git pull --ff-only
} >>"$LOG_FILE" 2>&1

if [ $? -ne 0 ]; then
  write_status "failed" "Couldn't pull latest changes — the server clone may have local edits or a diverged branch. See $MC_DIR/update.log on the server."
  exit 1
fi

write_status "running" "Installing dependencies and building"
{
  cd "$SERVER_DIR" && npm ci --no-fund --no-audit && npm run build
} >>"$LOG_FILE" 2>&1

if [ $? -ne 0 ]; then
  write_status "failed" "Build failed. See $MC_DIR/update.log on the server."
  exit 1
fi

write_status "restarting" "Update installed; restarting server"
sleep 1
launchctl kickstart -k "gui/$(id -u)/$LABEL" >>"$LOG_FILE" 2>&1 || {
  write_status "failed" "Update installed, but the server restart failed. See update.log."
  exit 1
}
write_status "succeeded" "Server updated and restarted"
