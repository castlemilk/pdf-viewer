#!/usr/bin/env bash
#
# Unlock the dedicated Apple build keychain before xcodebuild/code signing work.
#
# The App Store export path must not fall through to the login keychain: on this
# machine that can show a GUI "keychain login" prompt that is not useful for
# non-interactive release automation.

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  _ACACIA_KEYCHAIN_SOURCED=0
else
  _ACACIA_KEYCHAIN_SOURCED=1
fi

_acacia_keychain_fail() {
  echo "$1" >&2
  if [[ "$_ACACIA_KEYCHAIN_SOURCED" == "1" ]]; then
    return 1
  fi
  exit 1
}

_acacia_keychain_abspath() {
  local path="$1"
  local base_dir="$2"
  if [[ "$path" == /* ]]; then
    printf '%s\n' "$path"
  else
    printf '%s/%s\n' "$base_dir" "$path"
  fi
}

_acacia_keychain_strip_quotes() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  printf '%s\n' "$value"
}

_acacia_keychain_prepend_to_search_list() {
  local keychain_path="$1"
  local current_keychain
  local -a keychains=("$keychain_path")

  while IFS= read -r current_keychain; do
    current_keychain="${current_keychain#"${current_keychain%%[![:space:]]*}"}"
    current_keychain="$(_acacia_keychain_strip_quotes "$current_keychain")"
    [[ -z "$current_keychain" || "$current_keychain" == "$keychain_path" ]] && continue
    keychains+=("$current_keychain")
  done < <(security list-keychains -d user)

  security list-keychains -d user -s "${keychains[@]}"
}

if [[ "${APPLE_BUILD_KEYCHAIN_DISABLED:-0}" == "1" ]]; then
  if [[ "$_ACACIA_KEYCHAIN_SOURCED" == "1" ]]; then
    return 0
  fi
  exit 0
fi

ACACIA_KEYCHAIN_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACACIA_KEYCHAIN_DEFAULT_PATH="$ACACIA_KEYCHAIN_ROOT_DIR/.env.apple-certs/acacia-build.keychain-db"
ACACIA_KEYCHAIN_DEFAULT_PASSWORD_FILE="$ACACIA_KEYCHAIN_ROOT_DIR/.env.apple-certs/acacia-build.keychain.password"

APPLE_BUILD_KEYCHAIN_PATH="${PDFVIEWER_APPLE_BUILD_KEYCHAIN_PATH:-${ACACIA_BUILD_KEYCHAIN_PATH:-${APPLE_BUILD_KEYCHAIN_PATH:-$ACACIA_KEYCHAIN_DEFAULT_PATH}}}"
APPLE_BUILD_KEYCHAIN_PATH="$(_acacia_keychain_abspath "$APPLE_BUILD_KEYCHAIN_PATH" "$ACACIA_KEYCHAIN_ROOT_DIR")"
export APPLE_BUILD_KEYCHAIN_PATH

if [[ ! -f "$APPLE_BUILD_KEYCHAIN_PATH" ]]; then
  _acacia_keychain_fail "Apple build keychain is missing: $APPLE_BUILD_KEYCHAIN_PATH"
fi

APPLE_BUILD_KEYCHAIN_PASSWORD_FILE="${PDFVIEWER_APPLE_BUILD_KEYCHAIN_PASSWORD_FILE:-${ACACIA_BUILD_KEYCHAIN_PASSWORD_FILE:-${APPLE_BUILD_KEYCHAIN_PASSWORD_FILE:-$ACACIA_KEYCHAIN_DEFAULT_PASSWORD_FILE}}}"
APPLE_BUILD_KEYCHAIN_PASSWORD_FILE="$(_acacia_keychain_abspath "$APPLE_BUILD_KEYCHAIN_PASSWORD_FILE" "$ACACIA_KEYCHAIN_ROOT_DIR")"

ACACIA_KEYCHAIN_PASSWORD="${PDFVIEWER_APPLE_BUILD_KEYCHAIN_PASSWORD:-${ACACIA_BUILD_KEYCHAIN_PASSWORD:-${APPLE_BUILD_KEYCHAIN_PASSWORD:-}}}"
if [[ -z "$ACACIA_KEYCHAIN_PASSWORD" && -f "$APPLE_BUILD_KEYCHAIN_PASSWORD_FILE" ]]; then
  ACACIA_KEYCHAIN_PASSWORD="$(tr -d '\r\n' < "$APPLE_BUILD_KEYCHAIN_PASSWORD_FILE")"
fi

if [[ -z "$ACACIA_KEYCHAIN_PASSWORD" ]]; then
  _acacia_keychain_fail "Apple build keychain password is missing. Set APPLE_BUILD_KEYCHAIN_PASSWORD or APPLE_BUILD_KEYCHAIN_PASSWORD_FILE; refusing to continue because macOS would otherwise show a GUI keychain prompt."
fi

if ! security unlock-keychain -p "$ACACIA_KEYCHAIN_PASSWORD" "$APPLE_BUILD_KEYCHAIN_PATH"; then
  _acacia_keychain_fail "Failed to unlock Apple build keychain: $APPLE_BUILD_KEYCHAIN_PATH"
fi

security set-keychain-settings -lut "${APPLE_BUILD_KEYCHAIN_TIMEOUT_SECONDS:-21600}" "$APPLE_BUILD_KEYCHAIN_PATH"

if [[ "${APPLE_BUILD_KEYCHAIN_SKIP_PARTITION_LIST:-0}" != "1" ]]; then
  if ! security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$ACACIA_KEYCHAIN_PASSWORD" "$APPLE_BUILD_KEYCHAIN_PATH" >/dev/null; then
    _acacia_keychain_fail "Failed to refresh codesign partition access for Apple build keychain: $APPLE_BUILD_KEYCHAIN_PATH"
  fi
fi

_acacia_keychain_prepend_to_search_list "$APPLE_BUILD_KEYCHAIN_PATH"

ACACIA_KEYCHAIN_IDENTITY_COUNT="$(
  security find-identity -v -p codesigning "$APPLE_BUILD_KEYCHAIN_PATH" 2>/dev/null |
    awk '/valid identities found/ {print $1; found=1} END {if (!found) print 0}'
)"

if [[ "${ACACIA_KEYCHAIN_IDENTITY_COUNT:-0}" == "0" ]]; then
  _acacia_keychain_fail "Apple build keychain has no valid code-signing identities: $APPLE_BUILD_KEYCHAIN_PATH"
fi

echo "[keychain] Unlocked Apple build keychain: $APPLE_BUILD_KEYCHAIN_PATH"
echo "[keychain] Valid code-signing identities: $ACACIA_KEYCHAIN_IDENTITY_COUNT"

unset ACACIA_KEYCHAIN_PASSWORD
unset -f _acacia_keychain_abspath
unset -f _acacia_keychain_fail
unset -f _acacia_keychain_prepend_to_search_list
unset -f _acacia_keychain_strip_quotes
