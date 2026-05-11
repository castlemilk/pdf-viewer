#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run lint
npm test -- --runInBand
npm run typecheck
npm run macos:test

if [[ "${SKIP_E2E:-0}" == "1" ]]; then
  echo "Skipping macOS UI e2e tests because SKIP_E2E=1"
else
  npm run e2e:macos
fi

npm run package:macos
