#!/usr/bin/env bash
#
# Full local validation gate before building or uploading a Mac App Store archive.
#
# Upload is intentionally opt-in:
#   npm run publish:appstore -- --upload
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

UPLOAD_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --upload) UPLOAD_ARGS+=("--upload"); shift ;;
    *) UPLOAD_ARGS+=("$1"); shift ;;
  esac
done

npm run lint
npm test -- --runInBand
npm run typecheck
npm run macos:test

if [[ "${SKIP_E2E:-0}" == "1" ]]; then
  echo "Skipping macOS UI e2e tests because SKIP_E2E=1"
else
  npm run e2e:macos
fi

scripts/check-publishing-prereqs.sh
scripts/build-app-store-archive.sh "${UPLOAD_ARGS[@]}"
