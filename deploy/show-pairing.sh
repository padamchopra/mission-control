#!/bin/bash
# Reprint the pairing QR for the iOS app. Run on the server anytime after setup.
set -euo pipefail

# shellcheck source=config-dir.sh
. "$(dirname "$0")/config-dir.sh"
STORE="$MC_DIR/store.mjs"
[ -f "$STORE" ] || STORE="$(dirname "$0")/../server/scripts/store.mjs"
[ -f "$STORE" ] || { echo "No pairing info yet — run ./deploy/setup.sh first."; exit 1; }

APP_URL="$(node "$STORE" get pairing appUrl 2>/dev/null || true)"
TOKEN="$(node "$STORE" get pairing token 2>/dev/null || true)"
[ -n "$APP_URL" ] && [ -n "$TOKEN" ] || { echo "No pairing info yet — run ./deploy/setup.sh first."; exit 1; }

command -v qrencode >/dev/null || { echo "qrencode not installed (brew install qrencode)"; exit 1; }

PAIR_LINK="remy://configure?url=$APP_URL&token=$TOKEN"
echo "Scan in the app: Settings → \"Scan pairing QR\""
qrencode -t ANSIUTF8 -m 2 "$PAIR_LINK"
echo "Server URL : $APP_URL"
echo "Token      : $TOKEN"
echo ""
echo "On desktop, copy this link and use \"Paste pairing link\" in the app:"
echo "  $PAIR_LINK"
