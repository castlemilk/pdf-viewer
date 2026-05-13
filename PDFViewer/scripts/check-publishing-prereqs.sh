#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

required_tools=(xcodebuild xcrun codesign security plutil hdiutil shasum)

echo "=== Acacia publishing prerequisites ==="
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

HAS_APP_STORE_APP_CERT=0
HAS_APP_STORE_INSTALLER_CERT=0
if security find-identity -v -p codesigning | grep -Eq "(Apple Distribution|Mac App Distribution): .*\\($DEVELOPMENT_TEAM\\)"; then
  HAS_APP_STORE_APP_CERT=1
fi
if security find-identity -v -p codesigning | grep -Eq "Mac Installer Distribution: .*\\($DEVELOPMENT_TEAM\\)"; then
  HAS_APP_STORE_INSTALLER_CERT=1
fi

if [[ "$HAS_APP_STORE_APP_CERT" == "1" && "$HAS_APP_STORE_INSTALLER_CERT" == "1" ]]; then
  echo "  App Store distribution identities found locally"
else
  echo "  App Store distribution identities not complete locally"
  [[ "$HAS_APP_STORE_APP_CERT" == "1" ]] || echo "    missing: Mac App Distribution or Apple Distribution"
  [[ "$HAS_APP_STORE_INSTALLER_CERT" == "1" ]] || echo "    missing: Mac Installer Distribution"
  if [[ "${APP_STORE_EXPORT_USE_XCODE_ACCOUNT:-0}" == "1" ]]; then
    echo "    signed-in Xcode account export is enabled for App Store upload"
  else
    echo "    xcodebuild export can use cloud signing only if the ASC API key has that permission"
  fi
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
echo "Developer ID publishing prerequisites look ready."
if [[ "$HAS_APP_STORE_APP_CERT" == "1" && "$HAS_APP_STORE_INSTALLER_CERT" == "1" ]]; then
  echo "Mac App Store local signing prerequisites look ready."
else
  if [[ "${APP_STORE_EXPORT_USE_XCODE_ACCOUNT:-0}" == "1" ]]; then
    echo "Mac App Store export will use the signed-in Xcode account."
  else
    echo "Mac App Store export is blocked until local App Store signing certs are installed, ASC cloud signing permission is enabled, or APP_STORE_EXPORT_USE_XCODE_ACCOUNT=1 is set."
  fi
fi
