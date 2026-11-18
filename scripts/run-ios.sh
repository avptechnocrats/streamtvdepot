#!/usr/bin/env bash
# Runs the iOS app using the tenant selected in active-client.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIVE_FILE="$ROOT/active-client"

if [[ ! -f "$ACTIVE_FILE" ]]; then
  echo "Error: 'active-client' file not found."
  exit 1
fi

CLIENT=$(grep -vE '^[[:space:]]*#|^[[:space:]]*$' "$ACTIVE_FILE" | head -n1 | tr -d '[:space:]')
CLIENT_DIR="$ROOT/clients/$CLIENT"

if [[ -z "$CLIENT" || ! -d "$CLIENT_DIR" || "$CLIENT" == "_template" ]]; then
  echo "Error: client '$CLIENT' not found in clients/."
  exit 1
fi

BUNDLE_ID=$(node -e "process.stdout.write(require('$CLIENT_DIR/config.json').bundleId)")
APP_NAME=$(grep '^APP_NAME=' "$CLIENT_DIR/.env" | cut -d'=' -f2-)

"$ROOT/scripts/switch-client.sh" "$CLIENT"
export ENVFILE="$CLIENT_DIR/.env"

echo ""
echo "  Client   : $APP_NAME ($CLIENT)"
echo "  BundleId : $BUNDLE_ID"
echo "  Scheme   : StreamTVDepot"
echo ""

cd "$ROOT"
npx react-native run-ios \
  --scheme StreamTVDepot \
  --xcconfig "$CLIENT_DIR/ios.xcconfig" \
  --extra-params "ENVFILE=$CLIENT_DIR/.env TENANT_BUNDLE_IDENTIFIER=$BUNDLE_ID PRODUCT_BUNDLE_IDENTIFIER=$BUNDLE_ID APP_DISPLAY_NAME=$APP_NAME" \
  "$@"
