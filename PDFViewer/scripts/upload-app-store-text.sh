#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

VERSION="${VERSION:-${APP_STORE_VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}}"
TEXT_DIR="${APP_STORE_TEXT_DIR:-$ROOT_DIR/publishing/app-store-text}"

if [[ -z "${APP_STORE_CONNECT_APP_ID:-}" ]]; then
  echo "APP_STORE_CONNECT_APP_ID is required to upload App Store text metadata." >&2
  exit 1
fi

if [[ ! -d "$TEXT_DIR" ]]; then
  echo "App Store text folder does not exist: $TEXT_DIR" >&2
  exit 1
fi

if grep -R -E "TBD|REPLACE_BEFORE_UPLOAD|example\\.com" "$TEXT_DIR" >/dev/null; then
  echo "App Store text folder still contains placeholder values. Replace them before upload." >&2
  exit 1
fi

AUTH_ARGS=(--api-key "$APP_STORE_CONNECT_API_KEY_ID" --api-issuer "$APP_STORE_CONNECT_API_ISSUER_ID")
if [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" ]]; then
  AUTH_ARGS+=(--p8-file-path "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH")
elif [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY:-}" ]]; then
  AUTH_ARGS+=(--auth-string "$APP_STORE_CONNECT_API_PRIVATE_KEY")
fi

xcrun altool --app-store-text "$TEXT_DIR" \
  --upload \
  --apple-id "$APP_STORE_CONNECT_APP_ID" \
  --bundle-short-version-string "$VERSION" \
  --platform macos \
  "${AUTH_ARGS[@]}"
