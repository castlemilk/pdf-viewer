#!/usr/bin/env bash
#
# Verify an Acacia release DMG before publishing it.
#
# Usage:
#   scripts/verify-release-dmg.sh dist/macos/Acacia-0.0.1.dmg
#
set -euo pipefail

DMG="${1:?usage: verify-release-dmg.sh <path-to-dmg>}"
APP_NAME="${APP_NAME:-Acacia}"
EXPECTED_BUNDLE_ID="${BUNDLE_ID:-com.benebsworth.acacia}"
EXPECTED_TEAM_ID="${DEVELOPMENT_TEAM:-WFTX6CN23F}"
EXPECT_NOTARIZED="${EXPECT_NOTARIZED:-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ -f "$DMG" ]] || { echo "ERROR: $DMG missing" >&2; exit 1; }

MOUNT="$(mktemp -d -t pdfviewer-dmg-verify)"
STAGING="$(mktemp -d -t pdfviewer-launch-verify)"
trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; rm -rf "$MOUNT" "$STAGING"' EXIT

echo "[1/7] Mount DMG..."
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT"
APP="$MOUNT/${APP_NAME}.app"
[[ -d "$APP" ]] || { echo "FAIL: no ${APP_NAME}.app in DMG" >&2; exit 1; }

echo "[2/7] Check bundle identity..."
BID="$(plutil -extract CFBundleIdentifier raw "$APP/Contents/Info.plist")"
[[ "$BID" == "$EXPECTED_BUNDLE_ID" ]] || { echo "FAIL: bundle ID '$BID', expected '$EXPECTED_BUNDLE_ID'" >&2; exit 1; }
echo "  bundle: $BID"

echo "[3/7] Check Team IDs..."
APP_TEAM="$(codesign -dv "$APP" 2>&1 | awk -F= '/TeamIdentifier/{print $2}')"
[[ "$APP_TEAM" == "$EXPECTED_TEAM_ID" ]] || { echo "FAIL: Team ID '$APP_TEAM', expected '$EXPECTED_TEAM_ID'" >&2; exit 1; }
echo "  app team: $APP_TEAM"
for fw in "$APP/Contents/Frameworks"/*.framework; do
  [[ -d "$fw" ]] || continue
  FW_TEAM="$(codesign -dv "$fw" 2>&1 | awk -F= '/TeamIdentifier/{print $2}')"
  [[ "$FW_TEAM" == "$APP_TEAM" ]] || { echo "FAIL: $(basename "$fw") Team ID '$FW_TEAM', expected '$APP_TEAM'" >&2; exit 1; }
  echo "  $(basename "$fw") team: $FW_TEAM"
done

echo "[4/7] Check hardened runtime and entitlements..."
SIGNING_DETAILS="$(codesign -dv "$APP" 2>&1)"
echo "$SIGNING_DETAILS" | grep -q "runtime" || { echo "FAIL: hardened runtime flag missing" >&2; exit 1; }
ENTITLEMENTS="$(codesign -d --entitlements :- "$APP" 2>/dev/null || true)"
echo "$ENTITLEMENTS" | grep -q "com.apple.security.app-sandbox" || { echo "FAIL: sandbox entitlement missing" >&2; exit 1; }
echo "$ENTITLEMENTS" | grep -q "com.apple.security.files.user-selected.read-write" || { echo "FAIL: user-selected read-write entitlement missing" >&2; exit 1; }
if echo "$ENTITLEMENTS" | grep -q "com.apple.security.get-task-allow"; then
  echo "FAIL: release build has get-task-allow entitlement" >&2
  exit 1
fi
echo "  hardened runtime and release entitlements present"

echo "[5/7] Verify code signatures..."
codesign --verify --deep --strict "$APP" 2>&1 | sed 's/^/  /'

echo "[6/7] Gatekeeper/notarization checks..."
if [[ "$EXPECT_NOTARIZED" == "1" ]]; then
  xcrun stapler validate "$DMG" 2>&1 | sed 's/^/  /'
  if command -v syspolicy_check >/dev/null 2>&1; then
    syspolicy_check distribution "$DMG" --verbose 2>&1 | sed 's/^/  /'
  else
    spctl --assess --type open --verbose "$DMG" 2>&1 | sed 's/^/  /'
  fi
else
  echo "  skipped notarization checks"
fi

echo "[7/7] Launch smoke test..."
cp -R "$APP" "$STAGING/"
"$SCRIPT_DIR/smoke-macos-window.sh" --launchservices "$STAGING/${APP_NAME}.app"

echo ""
echo "$DMG is release-ready."
