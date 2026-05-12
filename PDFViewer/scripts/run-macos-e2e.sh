#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="${RUN_ID:-$$}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-${TMPDIR:-/tmp}/PDFViewerUIDerivedData-${RUN_ID}}"
RESULT_BUNDLE_PATH="${RESULT_BUNDLE_PATH:-${TMPDIR:-/tmp}/PDFViewer-macOS-UI-${RUN_ID}.xcresult}"
ARCHS="${ARCHS:-$(uname -m)}"

cleanup_stale_test_processes() {
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/PDFViewer.app/Contents/MacOS/PDFViewer" >/dev/null 2>&1 || true
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/PDFViewer-macOSUITests-Runner.app" >/dev/null 2>&1 || true
}

remove_path() {
  local path="$1"
  local attempt

  for attempt in 1 2 3; do
    rm -rf "$path" 2>/dev/null || true
    [[ ! -e "$path" ]] && return 0
    sleep "$attempt"
  done

  rm -rf "$path"
}

cleanup_stale_test_processes
remove_path "$DERIVED_DATA_PATH"
remove_path "$RESULT_BUNDLE_PATH"

cleanup() {
  cleanup_stale_test_processes
  remove_path "$DERIVED_DATA_PATH" || true
}
trap cleanup EXIT

cd "$ROOT_DIR"

FORCE_BUNDLING=1 xcodebuild \
  -quiet \
  test \
  -workspace macos/PDFViewer.xcworkspace \
  -scheme PDFViewer-macOS-UI \
  -configuration Release \
  -destination "platform=macOS,arch=${ARCHS}" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -resultBundlePath "$RESULT_BUNDLE_PATH" \
  ONLY_ACTIVE_ARCH=YES \
  ARCHS="$ARCHS" \
  ENABLE_HARDENED_RUNTIME=NO
