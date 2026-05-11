#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-/tmp/PDFViewerUIDerivedData}"
RESULT_BUNDLE_PATH="${RESULT_BUNDLE_PATH:-/tmp/PDFViewer-macOS-UI.xcresult}"
ARCHS="${ARCHS:-$(uname -m)}"

cleanup_stale_test_processes() {
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/PDFViewer.app/Contents/MacOS/PDFViewer" >/dev/null 2>&1 || true
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/PDFViewer-macOSUITests-Runner.app" >/dev/null 2>&1 || true
}

cleanup_stale_test_processes
rm -rf "$DERIVED_DATA_PATH" "$RESULT_BUNDLE_PATH"

cleanup() {
  cleanup_stale_test_processes
}
trap cleanup EXIT

cd "$ROOT_DIR"

FORCE_BUNDLING=1 xcodebuild \
  -quiet \
  test \
  -workspace macos/PDFViewer.xcworkspace \
  -scheme PDFViewer-macOS-UI \
  -configuration Release \
  -destination 'platform=macOS' \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -resultBundlePath "$RESULT_BUNDLE_PATH" \
  ONLY_ACTIVE_ARCH=YES \
  ARCHS="$ARCHS" \
  ENABLE_HARDENED_RUNTIME=NO
