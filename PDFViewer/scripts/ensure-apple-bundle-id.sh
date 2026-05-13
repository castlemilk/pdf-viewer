#!/usr/bin/env bash
#
# Ensure the Apple Developer/App Store Connect Bundle ID exists for Acacia.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

APP_NAME="${APP_NAME:-Acacia}"
PLATFORM="${APP_STORE_CONNECT_BUNDLE_PLATFORM:-MAC_OS}"

for cmd in curl jq xcrun; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required tool: $cmd" >&2
    exit 1
  }
done

if [[ -z "${APP_STORE_CONNECT_API_KEY_ID:-}" || -z "${APP_STORE_CONNECT_API_ISSUER_ID:-}" ]]; then
  echo "Missing APP_STORE_CONNECT_API_KEY_ID or APP_STORE_CONNECT_API_ISSUER_ID" >&2
  exit 1
fi

if [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" ]]; then
  [[ -f "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH" ]] || {
    echo "APP_STORE_CONNECT_API_PRIVATE_KEY_PATH does not exist" >&2
    exit 1
  }
  ASC_JWT="$(xcrun altool --generate-jwt \
    --api-key "$APP_STORE_CONNECT_API_KEY_ID" \
    --api-issuer "$APP_STORE_CONNECT_API_ISSUER_ID" \
    --p8-file-path "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH" 2>&1 \
    | awk '/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/ { print; exit }')"
elif [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY:-}" ]]; then
  ASC_JWT="$(xcrun altool --generate-jwt \
    --api-key "$APP_STORE_CONNECT_API_KEY_ID" \
    --api-issuer "$APP_STORE_CONNECT_API_ISSUER_ID" \
    --auth-string "$APP_STORE_CONNECT_API_PRIVATE_KEY" 2>&1 \
    | awk '/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/ { print; exit }')"
else
  echo "Missing APP_STORE_CONNECT_API_PRIVATE_KEY_PATH or APP_STORE_CONNECT_API_PRIVATE_KEY" >&2
  exit 1
fi

[[ -n "$ASC_JWT" ]] || { echo "Failed to generate App Store Connect JWT" >&2; exit 1; }

lookup_bundle_id() {
  curl -fsS -G \
    -H "Authorization: Bearer $ASC_JWT" \
    --data-urlencode "filter[identifier]=$BUNDLE_ID" \
    --data-urlencode "fields[bundleIds]=name,identifier,platform,seedId" \
    "https://api.appstoreconnect.apple.com/v1/bundleIds"
}

RESPONSE="$(lookup_bundle_id)"
EXISTING_ID="$(jq -r '.data[0].id // empty' <<<"$RESPONSE")"

if [[ -n "$EXISTING_ID" ]]; then
  echo "Bundle ID already exists:"
  jq -r '.data[0] | "  id: \(.id)\n  name: \(.attributes.name)\n  identifier: \(.attributes.identifier)\n  platform: \(.attributes.platform)\n  seedId: \(.attributes.seedId)"' <<<"$RESPONSE"
  exit 0
fi

PAYLOAD="$(jq -n \
  --arg identifier "$BUNDLE_ID" \
  --arg name "$APP_NAME" \
  --arg platform "$PLATFORM" \
  '{data:{type:"bundleIds",attributes:{identifier:$identifier,name:$name,platform:$platform}}}')"

CREATE_RESPONSE="$(curl -fsS \
  -H "Authorization: Bearer $ASC_JWT" \
  -H "Content-Type: application/json" \
  -X POST \
  --data "$PAYLOAD" \
  "https://api.appstoreconnect.apple.com/v1/bundleIds")"

echo "Created Bundle ID:"
jq -r '.data | "  id: \(.id)\n  name: \(.attributes.name)\n  identifier: \(.attributes.identifier)\n  platform: \(.attributes.platform)\n  seedId: \(.attributes.seedId)"' <<<"$CREATE_RESPONSE"
