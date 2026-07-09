#!/bin/bash
# Reprint the pairing QR for the iOS app. Run on the mini anytime after setup.
set -euo pipefail

ENV_FILE="$HOME/.mission-control/pairing.env"
[ -f "$ENV_FILE" ] || { echo "No pairing info yet — run ./deploy/setup-mini.sh first."; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

command -v qrencode >/dev/null || { echo "qrencode not installed (brew install qrencode)"; exit 1; }

echo "Scan in the app: Settings → \"Scan pairing QR\""
qrencode -t ANSIUTF8 -m 2 "missioncontrol://configure?url=$APP_URL&token=$TOKEN"
echo "Server URL : $APP_URL"
echo "Token      : $TOKEN"
