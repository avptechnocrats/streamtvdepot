#!/usr/bin/env bash
# ─── run-android.sh ────────────────────────────────────────────────────────────
# Reads the active tenant from 'active-client', derives all build flags from
# clients/<slug>/config.json, and runs react-native run-android.
#
# To switch tenant:
#   echo 'kalingotv' > active-client
#
# Then run:
#   npm run android          → dev (debug, hot-reload)
#   npm run bundle:android   → release AAB for Play Store
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIVE_FILE="$ROOT/active-client"

# ── Read active client slug ───────────────────────────────────────────────────
if [[ ! -f "$ACTIVE_FILE" ]]; then
  echo "Error: 'active-client' file not found."
  echo "Fix:   echo 'signalview' > active-client"
  exit 1
fi

CLIENT=$(grep -v '^\s*#' "$ACTIVE_FILE" | tr -d '[:space:]' | head -1)
CLIENT_DIR="$ROOT/clients/$CLIENT"

if [[ ! -d "$CLIENT_DIR" || "$CLIENT" == "_template" ]]; then
  echo "Error: client '$CLIENT' not found in clients/"
  echo "Available:"
  for d in "$ROOT/clients"/*/; do
    slug=$(basename "$d")
    [[ "$slug" == "_template" ]] && continue
    echo "  $slug"
  done
  exit 1
fi

# ── Read values from their respective sources ─────────────────────────────────
APP_ID=$(node -e "process.stdout.write(require('$CLIENT_DIR/config.json').androidPackage)")
APP_NAME=$(grep '^APP_NAME=' "$CLIENT_DIR/.env" | cut -d'=' -f2-)

# ── Switch client environment (.env + logo) ───────────────────────────────────
"$ROOT/scripts/switch-client.sh" "$CLIENT"

# ── Derive Gradle flavor name (strip hyphens/dots: kalingo-tv → kalingotv) ───
FLAVOR="${CLIENT//[-.]}"

echo ""
echo "  Client : $APP_NAME ($CLIENT)"
echo "  AppId  : $APP_ID"
echo "  Mode   : ${FLAVOR}Debug"
echo ""

npx react-native run-android \
  --mode "${FLAVOR}Debug" \
  --active-arch-only \
  --appId "$APP_ID" \
  --main-activity com.signalview.mobile.MainActivity
