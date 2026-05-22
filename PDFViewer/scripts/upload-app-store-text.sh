#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

VERSION="${VERSION:-${APP_STORE_VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}}"
TEXT_DIR="${APP_STORE_TEXT_DIR:-$ROOT_DIR/publishing/app-store-text}"
PLATFORM="${APP_STORE_TEXT_PLATFORM:-macos}"
INCLUDE_WHATS_NEW="${APP_STORE_TEXT_INCLUDE_WHATS_NEW:-0}"

if [[ -z "${APP_STORE_CONNECT_APP_ID:-}" ]]; then
  echo "APP_STORE_CONNECT_APP_ID is required to upload App Store text metadata." >&2
  exit 1
fi

if [[ ! -d "$TEXT_DIR" ]]; then
  echo "App Store text folder does not exist: $TEXT_DIR" >&2
  exit 1
fi

if find "$TEXT_DIR" -type f -name '*.txt' \
  ! -path '*/up-*/*' \
  ! -path '*/down-*/*' \
  -print0 | xargs -0 grep -E "TBD|REPLACE_BEFORE_UPLOAD|example\\.com" >/dev/null; then
  echo "App Store text metadata still contains placeholder values. Replace them before upload." >&2
  exit 1
fi

PLATFORM_DIR="$(node - "$PLATFORM" <<'NODE'
const platform = String(process.argv[2] || 'macos').trim().toLowerCase();
const map = {macos: 'MACOS', ios: 'IOS', appletvos: 'APPLETVOS', visionos: 'VISIONOS'};
process.stdout.write(map[platform] || platform.toUpperCase());
NODE
)"

UPLOAD_DIR="$TEXT_DIR"
STAGED_TEXT_DIR=""

write_text_field() {
  local key="$1"
  local source_file="$2"
  local target_file="$3"
  [[ -s "$source_file" ]] || return 0

  node - "$key" "$source_file" "$target_file" <<'NODE'
const fs = require('node:fs');
const [key, sourceFile, targetFile] = process.argv.slice(2);
const raw = fs.readFileSync(sourceFile, 'utf8').trim();
const escaped = raw
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\r?\n/g, '\\n');
fs.appendFileSync(targetFile, `"${key}" = "${escaped}";\n`);
NODE
}

stage_source_text() {
  STAGED_TEXT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/AcaciaAppStoreText.XXXXXX")"
  UPLOAD_DIR="$STAGED_TEXT_DIR"

  local upload_root="$UPLOAD_DIR/up-$APP_STORE_CONNECT_APP_ID"
  mkdir -p "$upload_root/$PLATFORM_DIR" "$upload_root/appInfo"

  local locale_dir locale platform_file app_info_file
  for locale_dir in "$TEXT_DIR"/*; do
    [[ -d "$locale_dir" ]] || continue
    case "$(basename "$locale_dir")" in
      up-*|down-*) continue ;;
    esac

    locale="$(basename "$locale_dir")"
    platform_file="$upload_root/$PLATFORM_DIR/$locale.txt"
    app_info_file="$upload_root/appInfo/$locale.txt"
    : >"$platform_file"
    : >"$app_info_file"

    write_text_field promotionalText "$locale_dir/promotionalText.txt" "$platform_file"
    write_text_field description "$locale_dir/description.txt" "$platform_file"
    write_text_field keywords "$locale_dir/keywords.txt" "$platform_file"
    write_text_field supportUrl "$locale_dir/supportUrl.txt" "$platform_file"
    write_text_field marketingUrl "$locale_dir/marketingUrl.txt" "$platform_file"
    if [[ "$INCLUDE_WHATS_NEW" == "1" ]]; then
      write_text_field whatsNew "$locale_dir/whatsNew.txt" "$platform_file"
    fi

    write_text_field name "$locale_dir/name.txt" "$app_info_file"
    write_text_field subtitle "$locale_dir/subtitle.txt" "$app_info_file"
    write_text_field privacyPolicyUrl "$locale_dir/privacyPolicyUrl.txt" "$app_info_file"
  done

  if [[ -s "$TEXT_DIR/copyright.txt" ]]; then
    write_text_field copyright "$TEXT_DIR/copyright.txt" "$upload_root/$PLATFORM_DIR/metadata.txt"
  fi
}

if [[ ! -d "$TEXT_DIR/up-$APP_STORE_CONNECT_APP_ID" ]]; then
  stage_source_text
fi

cleanup() {
  if [[ -n "$STAGED_TEXT_DIR" ]]; then
    rm -rf "$STAGED_TEXT_DIR"
  fi
}
trap cleanup EXIT

AUTH_ARGS=(--api-key "$APP_STORE_CONNECT_API_KEY_ID" --api-issuer "$APP_STORE_CONNECT_API_ISSUER_ID")
if [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" ]]; then
  AUTH_ARGS+=(--p8-file-path "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH")
elif [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY:-}" ]]; then
  AUTH_ARGS+=(--auth-string "$APP_STORE_CONNECT_API_PRIVATE_KEY")
fi

set +e
UPLOAD_OUTPUT="$(xcrun altool --app-store-text "$UPLOAD_DIR" \
  --upload \
  --apple-id "$APP_STORE_CONNECT_APP_ID" \
  --bundle-short-version-string "$VERSION" \
  --platform "$PLATFORM" \
  "${AUTH_ARGS[@]}" 2>&1)"
UPLOAD_EXIT=$?
set -e

printf '%s\n' "$UPLOAD_OUTPUT"

if [[ "$UPLOAD_EXIT" -ne 0 ]] || grep -E "Unable to upload app store text|Error Domain=|NSLocalizedFailureReason=" <<<"$UPLOAD_OUTPUT" >/dev/null; then
  exit 1
fi
