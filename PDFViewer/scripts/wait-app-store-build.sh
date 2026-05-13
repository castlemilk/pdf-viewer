#!/usr/bin/env bash
#
# Poll App Store Connect until the uploaded Acacia build finishes processing.
#
# Usage:
#   scripts/wait-app-store-build.sh [--version VERSION] [--build-number NUMBER]
#                                   [--platform MAC_OS|IOS]
#                                   [--attempts N] [--delay SECONDS]
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

VERSION="${VERSION:-${APP_STORE_VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}}"
BUILD_NUMBER="${BUILD_NUMBER:-${APP_STORE_BUILD_NUMBER:-1}}"
PLATFORM="${APP_STORE_PLATFORM:-MAC_OS}"
ATTEMPTS="${APP_STORE_PROCESSING_ATTEMPTS:-20}"
DELAY_SECONDS="${APP_STORE_PROCESSING_DELAY_SECONDS:-60}"
METADATA_PATH="${APP_STORE_UPLOAD_METADATA_PATH:-$ROOT_DIR/dist/app-store/app-store-upload.json}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --build-number) BUILD_NUMBER="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --attempts) ATTEMPTS="$2"; shift 2 ;;
    --delay) DELAY_SECONDS="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/s/^#//p' "$0"
      exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1 ;;
  esac
done

if [[ -f "$METADATA_PATH" ]]; then
  VERSION="$(node -e "const m=require('$METADATA_PATH'); console.log(m.marketingVersion || '$VERSION')")"
  BUILD_NUMBER="$(node -e "const m=require('$METADATA_PATH'); console.log(m.buildNumber || '$BUILD_NUMBER')")"
  PLATFORM="$(node -e "const m=require('$METADATA_PATH'); console.log(m.platform || '$PLATFORM')")"
fi

extract_status() {
  local status_file="$1"
  node - "$status_file" <<'NODE'
const fs = require('node:fs');
const raw = fs.readFileSync(process.argv[2], 'utf8');

const known = new Set([
  'VALID',
  'PROCESSING',
  'FAILED',
  'INVALID',
  'REJECTED',
  'UPLOADED',
  'WAITING',
  'IN_PROGRESS',
  'COMPLETE',
  'COMPLETED',
  'SUCCESS',
  'READY',
]);

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function walk(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach(item => walk(item, found));
    return found;
  }
  if (!value || typeof value !== 'object') {
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === 'string' &&
      /(processingState|processing_state|status|state)$/i.test(key)
    ) {
      const normalized = child.toUpperCase().replace(/[^A-Z_]/g, '_');
      if (known.has(normalized)) {
        found.push(normalized);
      }
    }
    walk(child, found);
  }
  return found;
}

const parsed = parseJson(raw);
const statuses = parsed ? walk(parsed) : [];
if (statuses.length === 0) {
  const match = raw.toUpperCase().match(
    /\b(VALID|PROCESSING|FAILED|INVALID|REJECTED|UPLOADED|WAITING|IN_PROGRESS|COMPLETE|COMPLETED|SUCCESS|READY)\b/,
  );
  if (match) {
    statuses.push(match[1]);
  }
}

const priority = [
  'FAILED',
  'INVALID',
  'REJECTED',
  'VALID',
  'COMPLETE',
  'COMPLETED',
  'SUCCESS',
  'READY',
  'PROCESSING',
  'IN_PROGRESS',
  'UPLOADED',
  'WAITING',
];

const status = priority.find(candidate => statuses.includes(candidate)) || '';
process.stdout.write(status);
NODE
}

echo "=== Waiting for Acacia App Store Connect processing ==="
echo "App ID:  ${APP_STORE_CONNECT_APP_ID}"
echo "Version: ${VERSION}"
echo "Build:   ${BUILD_NUMBER}"
echo "Platform:${PLATFORM}"
echo ""

attempt=1
last_output="$(mktemp "${TMPDIR:-/tmp}/AcaciaAppStoreStatus.XXXXXX")"
trap 'rm -f "$last_output"' EXIT

while [[ "$attempt" -le "$ATTEMPTS" ]]; do
  echo "[status] attempt ${attempt}/${ATTEMPTS}"
  set +e
  VERSION="$VERSION" BUILD_NUMBER="$BUILD_NUMBER" APP_STORE_PLATFORM="$PLATFORM" scripts/check-app-store-status.sh >"$last_output" 2>&1
  status_exit=$?
  set -e

  if [[ "$status_exit" -ne 0 ]]; then
    cat "$last_output"
    status=""
  else
    cat "$last_output"
    status="$(extract_status "$last_output")"
  fi

  case "$status" in
    VALID|COMPLETE|COMPLETED|SUCCESS|READY)
      echo ""
      echo "App Store Connect build processing completed: ${status}"
      exit 0
      ;;
    FAILED|INVALID|REJECTED)
      echo ""
      echo "App Store Connect build processing failed: ${status}" >&2
      exit 1
      ;;
    *)
      if [[ "$attempt" -ge "$ATTEMPTS" ]]; then
        echo ""
        echo "Timed out waiting for App Store Connect build processing." >&2
        echo "Last parsed status: ${status:-unknown}" >&2
        exit 1
      fi
      sleep "$DELAY_SECONDS"
      ;;
  esac

  attempt=$((attempt + 1))
done
