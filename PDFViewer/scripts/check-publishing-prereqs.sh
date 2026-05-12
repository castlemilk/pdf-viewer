#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

required_tools=(xcodebuild xcrun codesign security plutil hdiutil shasum)

echo "=== PDFViewer publishing prerequisites ==="
echo "Bundle ID: $BUNDLE_ID"
echo "Team ID:   $DEVELOPMENT_TEAM"
echo ""

echo "[1/5] Toolchain"
for tool in "${required_tools[@]}"; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Missing required tool: $tool" >&2
    exit 1
  }
  echo "  $tool: $(command -v "$tool")"
done

echo "[2/5] Code signing identities"
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application: .*($DEVELOPMENT_TEAM)"; then
  echo "Missing Developer ID Application identity for team $DEVELOPMENT_TEAM" >&2
  exit 1
fi
echo "  Developer ID Application identity found"

if security find-identity -v -p codesigning | grep -Eq "(Apple Distribution|Mac App Distribution): .*\\($DEVELOPMENT_TEAM\\)"; then
  echo "  App Store distribution identity found locally"
else
  echo "  App Store distribution identity not found locally; xcodebuild can use ASC API cloud signing if the key has access"
fi

echo "[3/5] Notarization profile"
if xcrun notarytool history --keychain-profile "${NOTARY_PROFILE:-brandbrain}" --output-format json >/dev/null; then
  echo "  notarytool profile '${NOTARY_PROFILE:-brandbrain}' works"
else
  echo "Missing or invalid notarytool keychain profile '${NOTARY_PROFILE:-brandbrain}'" >&2
  exit 1
fi

echo "[4/5] App Store Connect API credentials"
if [[ -z "${APP_STORE_CONNECT_API_KEY_ID:-}" || -z "${APP_STORE_CONNECT_API_ISSUER_ID:-}" ]]; then
  echo "Missing APP_STORE_CONNECT_API_KEY_ID or APP_STORE_CONNECT_API_ISSUER_ID" >&2
  exit 1
fi

if [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" ]]; then
  [[ -f "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH" ]] || {
    echo "APP_STORE_CONNECT_API_PRIVATE_KEY_PATH does not exist" >&2
    exit 1
  }
  echo "  ASC API key path found"
elif [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY:-}" ]]; then
  echo "  ASC API private key is available from environment"
else
  echo "Missing APP_STORE_CONNECT_API_PRIVATE_KEY_PATH or APP_STORE_CONNECT_API_PRIVATE_KEY" >&2
  exit 1
fi
echo "  key id: $APP_STORE_CONNECT_API_KEY_ID"
echo "  issuer: configured"

echo "[5/5] App Store Connect reachability"
if [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" ]]; then
  ASC_JWT="$(xcrun altool --generate-jwt \
    --api-key "$APP_STORE_CONNECT_API_KEY_ID" \
    --api-issuer "$APP_STORE_CONNECT_API_ISSUER_ID" \
    --p8-file-path "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH" 2>&1 \
    | awk '/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/ { print; exit }')"
else
  ASC_JWT="$(xcrun altool --generate-jwt \
    --api-key "$APP_STORE_CONNECT_API_KEY_ID" \
    --api-issuer "$APP_STORE_CONNECT_API_ISSUER_ID" \
    --auth-string "$APP_STORE_CONNECT_API_PRIVATE_KEY" 2>&1 \
    | awk '/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/ { print; exit }')"
fi
curl -fsS \
  -H "Authorization: Bearer $ASC_JWT" \
  "https://api.appstoreconnect.apple.com/v1/apps?limit=1" >/dev/null
echo "  App Store Connect API reachable"

if [[ -n "${APP_STORE_CONNECT_APP_ID:-}" ]]; then
  echo "  App Store app id: $APP_STORE_CONNECT_APP_ID"
else
  echo "  App Store app id: not configured yet; required for metadata text upload and build-status checks"
fi

echo ""
echo "Publishing prerequisites look ready."
