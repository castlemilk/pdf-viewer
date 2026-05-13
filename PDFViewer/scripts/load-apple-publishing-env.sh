#!/usr/bin/env bash
#
# Source Apple publishing credentials for local release scripts.
#
# This intentionally loads only an allowlist from shared fallback env files so
# a neighboring app's App Store app id cannot be applied to Acacia by accident.
#
# Usage:
#   source scripts/load-apple-publishing-env.sh
#

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "This script must be sourced: source scripts/load-apple-publishing-env.sh" >&2
  exit 2
fi

PDFVIEWER_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

_pdfviewer_read_env_key() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  (
    set -a
    # shellcheck disable=SC1090
    source "$file" >/dev/null 2>&1 || exit 0
    printf '%s' "${!key:-}"
  )
}

_pdfviewer_load_allowed_env_file() {
  local file="$1"
  shift
  [[ -f "$file" ]] || return 0

  local key value
  for key in "$@"; do
    if [[ -z "${!key:-}" ]]; then
      value="$(_pdfviewer_read_env_key "$file" "$key")"
      if [[ -n "$value" ]]; then
        export "$key=$value"
      fi
    fi
  done
}

_pdfviewer_source_project_env() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

_pdfviewer_source_project_env "${PDFVIEWER_APPLE_ENV_FILE:-$PDFVIEWER_ROOT_DIR/.env.apple}"
_pdfviewer_source_project_env "$PDFVIEWER_ROOT_DIR/.env"

_pdfviewer_load_allowed_env_file \
  "/Users/benebsworth/projects/greenveil/.env" \
  APP_STORE_CONNECT_API_KEY_ID \
  APP_STORE_CONNECT_API_ISSUER_ID \
  APP_STORE_CONNECT_API_PRIVATE_KEY_PATH \
  APP_STORE_CONNECT_API_PRIVATE_KEY \
  API_PRIVATE_KEYS_DIR \
  APPLE_ID \
  APPLE_APP_SPECIFIC_PASSWORD \
  APPLE_APP_SPECIFIC_PASSWORD_KEYCHAIN_ITEM

export DEVELOPMENT_TEAM="${PDFVIEWER_DEVELOPMENT_TEAM:-${DEVELOPMENT_TEAM:-WFTX6CN23F}}"
export BUNDLE_ID="${PDFVIEWER_BUNDLE_ID:-${BUNDLE_ID:-com.benebsworth.acacia}}"
export APP_STORE_CONNECT_BUNDLE_ID="${PDFVIEWER_APP_STORE_CONNECT_BUNDLE_ID:-${APP_STORE_CONNECT_BUNDLE_ID:-$BUNDLE_ID}}"
export APP_STORE_CONNECT_APP_ID="${PDFVIEWER_APP_STORE_CONNECT_APP_ID:-${APP_STORE_CONNECT_APP_ID:-6768526705}}"

if [[ -n "${PDFVIEWER_APP_STORE_CONNECT_APP_ID:-}" ]]; then
  export APP_STORE_CONNECT_APP_ID="$PDFVIEWER_APP_STORE_CONNECT_APP_ID"
fi

if [[ -n "${PDFVIEWER_APP_STORE_CONNECT_API_KEY_ID:-}" ]]; then
  export APP_STORE_CONNECT_API_KEY_ID="$PDFVIEWER_APP_STORE_CONNECT_API_KEY_ID"
fi

if [[ -n "${PDFVIEWER_APP_STORE_CONNECT_API_ISSUER_ID:-}" ]]; then
  export APP_STORE_CONNECT_API_ISSUER_ID="$PDFVIEWER_APP_STORE_CONNECT_API_ISSUER_ID"
fi

if [[ -n "${PDFVIEWER_APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" ]]; then
  export APP_STORE_CONNECT_API_PRIVATE_KEY_PATH="$PDFVIEWER_APP_STORE_CONNECT_API_PRIVATE_KEY_PATH"
fi

if [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" && -z "${API_PRIVATE_KEYS_DIR:-}" ]]; then
  export API_PRIVATE_KEYS_DIR="$(dirname "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH")"
fi

unset -f _pdfviewer_read_env_key
unset -f _pdfviewer_load_allowed_env_file
unset -f _pdfviewer_source_project_env
