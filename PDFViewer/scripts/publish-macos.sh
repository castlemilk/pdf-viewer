#!/usr/bin/env bash
#
# Local publish gate for a signed and notarized macOS DMG.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
DMG_PATH="${DIST_DIR:-${ROOT_DIR}/dist/macos}/PDFViewer-${VERSION}.dmg"

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

scripts/build-release-dmg.sh --version "$VERSION" --build-number "$BUILD_NUMBER"
scripts/verify-release-dmg.sh "$DMG_PATH"
