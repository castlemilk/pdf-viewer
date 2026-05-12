#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

VERSION="${VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
METADATA_PATH="${APP_STORE_UPLOAD_METADATA_PATH:-$ROOT_DIR/dist/app-store/app-store-upload.json}"

if [[ -f "$METADATA_PATH" ]]; then
  VERSION="$(node -e "const m=require('$METADATA_PATH'); console.log(m.marketingVersion || '$VERSION')")"
  BUILD_NUMBER="$(node -e "const m=require('$METADATA_PATH'); console.log(m.buildNumber || '$BUILD_NUMBER')")"
  DELIVERY_ID="$(node -e "const m=require('$METADATA_PATH'); console.log(m.deliveryId || '')")"
else
  DELIVERY_ID="${APP_STORE_DELIVERY_ID:-}"
fi

if [[ -z "${APP_STORE_CONNECT_APP_ID:-}" ]]; then
  echo "APP_STORE_CONNECT_APP_ID is required for App Store build status checks." >&2
  exit 1
fi

AUTH_ARGS=(--api-key "$APP_STORE_CONNECT_API_KEY_ID" --api-issuer "$APP_STORE_CONNECT_API_ISSUER_ID")
if [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" ]]; then
  AUTH_ARGS+=(--p8-file-path "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH")
elif [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY:-}" ]]; then
  AUTH_ARGS+=(--auth-string "$APP_STORE_CONNECT_API_PRIVATE_KEY")
fi

ARGS=(altool --build-status --output-format json --platform macos)
if [[ -n "${DELIVERY_ID:-}" ]]; then
  ARGS+=(--delivery-id "$DELIVERY_ID")
else
  ARGS+=(--apple-id "$APP_STORE_CONNECT_APP_ID" --bundle-version "$BUILD_NUMBER" --bundle-short-version-string "$VERSION")
fi

xcrun "${ARGS[@]}" "${AUTH_ARGS[@]}"
