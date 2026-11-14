#!/usr/bin/env bash
# ─── switch-client.sh ──────────────────────────────────────────────────────────
# Activates a client config for local development and building.
# Usage:
#   ./scripts/switch-client.sh signalview
#   ./scripts/switch-client.sh kalingotv
#
# What this does:
#   1. Copies clients/<slug>/.env → .env  (react-native-config reads this)
#   2. Copies clients/<slug>/logo.png → assets/logo.png  (bundled logo)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

CLIENT="${1:-}"

if [[ -z "$CLIENT" ]]; then
  echo "Usage: $0 <client-slug>"
  echo ""
  echo "Available clients:"
  for d in "$ROOT/clients"/*/; do
    slug=$(basename "$d")
    [[ "$slug" == "_template" ]] && continue
    echo "  - $slug"
  done
  exit 1
fi

CLIENT_DIR="$ROOT/clients/$CLIENT"

if [[ ! -d "$CLIENT_DIR" ]]; then
  echo "Error: client '$CLIENT' not found in clients/"
  echo "Run: cp -r clients/_template clients/$CLIENT && edit clients/$CLIENT/config.json"
  exit 1
fi

echo "→ Switching to client: $CLIENT"

# 1. Activate .env for react-native-config
if [[ -f "$CLIENT_DIR/.env" ]]; then
  cp "$CLIENT_DIR/.env" "$ROOT/.env"
  echo "  ✓ Copied .env"
else
  echo "  ✗ Warning: clients/$CLIENT/.env not found — .env unchanged"
fi

# 2. Copy bundled logo (used as offline/pre-load fallback in BrandLogo.tsx)
if [[ -f "$CLIENT_DIR/logo.png" ]]; then
  cp "$CLIENT_DIR/logo.png" "$ROOT/assets/logo.png"
  echo "  ✓ Copied logo.png"
else
  echo "  ⚠  clients/$CLIENT/logo.png not found — keeping existing assets/logo.png"
fi

echo ""
echo "Client '$CLIENT' is now active."
echo "Run: npx react-native run-android   (Android)"
echo "     npx react-native run-ios       (iOS)"
