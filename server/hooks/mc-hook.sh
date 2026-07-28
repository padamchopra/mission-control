#!/bin/bash
# Agent hook → Mission Control event forwarder.
# Reports Claude Code and Codex sessions running inside tmux (non-tmux sessions
# have no pane to attach to, so they're skipped). Always exits 0 so a forwarding
# failure can never block the agent session itself.

EVENT="$1"
AGENT="${2:-claude}"
[ -n "$EVENT" ] || exit 0
[ -n "${TMUX_PANE:-}" ] || exit 0
case "$AGENT" in claude|codex) ;; *) exit 0 ;; esac

SESSION="$(tmux display-message -p -t "$TMUX_PANE" '#S' 2>/dev/null | tr -cd 'A-Za-z0-9._-')"
[ -n "$SESSION" ] || exit 0

CONFIG="$HOME/.mission-control/config.json"
[ -f "$CONFIG" ] || exit 0
TOKEN="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).token' "$CONFIG" 2>/dev/null)"
PORT="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).port || 8420' "$CONFIG" 2>/dev/null)"
[ -n "$TOKEN" ] || exit 0

curl -s -m 2 -X POST \
  "http://127.0.0.1:${PORT}/events?session=${SESSION}&event=${EVENT}&agent=${AGENT}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- >/dev/null 2>&1

exit 0
