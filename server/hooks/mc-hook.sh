#!/bin/bash
# Claude Code hook → Mission Control event forwarder.
# Fires only inside spawner-launched tmux sessions (TICKET_BOT=1); interactive
# sessions on any machine stay silent. Always exits 0 so a forwarding failure
# can never block the Claude session itself.

EVENT="$1"
[ -n "$EVENT" ] || exit 0
[ "${TICKET_BOT:-0}" = "1" ] || exit 0
[ -n "${TMUX_PANE:-}" ] || exit 0

SESSION="$(tmux display-message -p -t "$TMUX_PANE" '#S' 2>/dev/null | tr -cd 'A-Za-z0-9._-')"
[ -n "$SESSION" ] || exit 0

CONFIG="$HOME/.mission-control/config.json"
[ -f "$CONFIG" ] || exit 0
TOKEN="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).token' "$CONFIG" 2>/dev/null)"
PORT="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).port || 8420' "$CONFIG" 2>/dev/null)"
[ -n "$TOKEN" ] || exit 0

curl -s -m 5 -X POST \
  "http://127.0.0.1:${PORT}/events?session=${SESSION}&event=${EVENT}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- >/dev/null 2>&1

exit 0
