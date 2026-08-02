#!/bin/bash
# Agent hook → Mission Control event forwarder.
# Reports Claude Code and Codex sessions running inside tmux (non-tmux sessions
# have no pane to attach to, so they're skipped). Always exits 0 so a forwarding
# failure can never block the agent session itself. AskUserQuestion is the one
# deliberate exception: its Claude PreToolUse hook waits for Mission Control to
# return structured answers, then falls back to Claude's terminal dialog if the
# server is unavailable or the request times out.

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

PAYLOAD="$(cat)"
TOOL_NAME=""
if [ "$AGENT" = "claude" ] && [ "$EVENT" = "PreToolUse" ]; then
  TOOL_NAME="$(printf '%s' "$PAYLOAD" | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try { process.stdout.write(JSON.parse(input).tool_name ?? ""); } catch {}
    });
  ' 2>/dev/null)"
fi

if [ "$TOOL_NAME" = "AskUserQuestion" ]; then
  if RESPONSE="$(printf '%s' "$PAYLOAD" | curl -fsS --max-time 3595 -X POST \
      "http://127.0.0.1:${PORT}/hooks/ask-user-question?session=${SESSION}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      --data-binary @- 2>/dev/null)"; then
    [ -n "$RESPONSE" ] && printf '%s\n' "$RESPONSE"
    exit 0
  fi
  # Returning no hook output lets Claude render its normal terminal dialog.
  # Still forward the event below so Conversation can show the pane fallback.
fi

printf '%s' "$PAYLOAD" | curl -s -m 2 -X POST \
  "http://127.0.0.1:${PORT}/events?session=${SESSION}&event=${EVENT}&agent=${AGENT}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- >/dev/null 2>&1

exit 0
