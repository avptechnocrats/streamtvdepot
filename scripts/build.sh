#!/usr/bin/env bash
# ─── build.sh ──────────────────────────────────────────────────────────────────
# Builds a release APK / AAB / IPA for a specific client.
# Usage:
#   ./scripts/build.sh signalview android         → debug APK
#   ./scripts/build.sh signalview android release  → release APK
#   ./scripts/build.sh signalview android aab      → release AAB (Play Store)
#   ./scripts/build.sh kalingotv ios               → debug IPA (sim)
#   ./scripts/build.sh kalingotv ios release       → release IPA (device)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

CLIENT="${1:-}"
PLATFORM="${2:-}"
BUILD_TYPE="${3:-debug}"

if [[ -z "$CLIENT" || -z "$PLATFORM" ]]; then
  echo "Usage: $0 <client-slug> <android|ios> [debug|release]"
  exit 1
fi

CLIENT_DIR="$ROOT/clients/$CLIENT"
if [[ ! -d "$CLIENT_DIR" ]]; then
  echo "Error: client '$CLIENT' not found in clients/"
  exit 1
fi

# ── Activate client config ─────────────────────────────────────────────────────
"$SCRIPT_DIR/switch-client.sh" "$CLIENT"

# ── Capitalise slug for Gradle flavor name (signalview → Signalview) ──────────
FLAVOR_CAP="$(tr '[:lower:]' '[:upper:]' <<< "${CLIENT:0:1}")${CLIENT:1}"
# Strip hyphens/dots for valid Gradle identifiers
FLAVOR="${CLIENT//[-.]}"
FLAVOR_CAP="$(tr '[:lower:]' '[:upper:]' <<< "${FLAVOR:0:1}")${FLAVOR:1}"

BUILD_TYPE_CAP="$(tr '[:lower:]' '[:upper:]' <<< "${BUILD_TYPE:0:1}")${BUILD_TYPE:1}"

# ── Build ──────────────────────────────────────────────────────────────────────
if [[ "$PLATFORM" == "android" ]]; then

  echo ""
  echo "=== Building Android: $CLIENT ($BUILD_TYPE) ==="
  VARIANT="${FLAVOR}${BUILD_TYPE_CAP}"

  cd "$ROOT/android"

  if [[ "$BUILD_TYPE" == "aab" ]]; then
    # AAB for Play Store upload
    ./gradlew "bundle${FLAVOR_CAP}Release"
    OUTPUT_PATH=$(find "$ROOT/android/app/build/outputs/bundle/${FLAVOR}release" -name "*.aab" 2>/dev/null | head -1)
    echo ""
    echo "✓ AAB: $OUTPUT_PATH"
  else
    ./gradlew "assemble${VARIANT}"
    OUTPUT_PATH=$(find "$ROOT/android/app/build/outputs/apk/${FLAVOR}/${BUILD_TYPE}" -name "*.apk" 2>/dev/null | head -1)
    echo ""
    echo "✓ APK: $OUTPUT_PATH"
  fi

elif [[ "$PLATFORM" == "ios" ]]; then

  echo ""
  echo "=== Building iOS: $CLIENT ($BUILD_TYPE) ==="

  # react-native-config uses ENVFILE env var on iOS
  export ENVFILE="$CLIENT_DIR/.env"

  if [[ "$BUILD_TYPE" == "release" ]]; then
    xcodebuild \
      -workspace "$ROOT/ios/SignalView.xcworkspace" \
      -scheme "SignalView" \
      -configuration "Release" \
      -xcconfig "$CLIENT_DIR/ios.xcconfig" \
      -destination "generic/platform=iOS" \
      -archivePath "/tmp/SignalView-${CLIENT}.xcarchive" \
      archive \
      ENVFILE="$CLIENT_DIR/.env"
    echo ""
    echo "✓ Archive: /tmp/SignalView-${CLIENT}.xcarchive"
    echo "  Next: xcodebuild -exportArchive -archivePath ... -exportOptionsPlist ExportOptions.plist"
  else
    xcodebuild \
      -workspace "$ROOT/ios/SignalView.xcworkspace" \
      -scheme "SignalView" \
      -configuration "Debug" \
      -xcconfig "$CLIENT_DIR/ios.xcconfig" \
      -destination "platform=iOS Simulator,name=iPhone 15" \
      build \
      ENVFILE="$CLIENT_DIR/.env"
    echo ""
    echo "✓ iOS Debug build complete for $CLIENT"
  fi

else
  echo "Error: unknown platform '$PLATFORM'. Use 'android' or 'ios'."
  exit 1
fi
