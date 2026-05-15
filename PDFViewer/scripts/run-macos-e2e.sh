#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="${RUN_ID:-$$}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-${TMPDIR:-/tmp}/AcaciaUIDerivedData-${RUN_ID}}"
RESULT_BUNDLE_PATH="${RESULT_BUNDLE_PATH:-${TMPDIR:-/tmp}/Acacia-macOS-UI-${RUN_ID}.xcresult}"
ARCHS="${ARCHS:-$(uname -m)}"
XCODEBUILD_ARGS=(
  test
  -quiet
  -workspace macos/PDFViewer.xcworkspace
  -scheme PDFViewer-macOS-UI
  -configuration Release
  -destination "platform=macOS,arch=${ARCHS}"
  -derivedDataPath "$DERIVED_DATA_PATH"
  -resultBundlePath "$RESULT_BUNDLE_PATH"
  ONLY_ACTIVE_ARCH=YES
  ARCHS="$ARCHS"
  ENABLE_HARDENED_RUNTIME=NO
  COPY_PHASE_STRIP=NO
  STRIP_INSTALLED_PRODUCT=NO
  TEST_TARGET_NAME="Acacia-macOS"
)

if [[ -n "${ONLY_TESTING:-}" ]]; then
  XCODEBUILD_ARGS+=("-only-testing:${ONLY_TESTING}")
fi

prepare_real_pdf_fixture() {
  local source_path="${PDFVIEWER_REAL_PDF_SOURCE:-$HOME/Downloads/2025 Electronic Pack - Ben Ebsworth.pdf}"
  local fixture_dir="/tmp/AcaciaUITestFixtures"
  local fixture_path="$fixture_dir/2025 Electronic Pack - Ben Ebsworth.pdf"

  if [[ ! -f "$source_path" ]]; then
    return 0
  fi

  mkdir -p "$fixture_dir"
  cp "$source_path" "$fixture_path"
  export PDFVIEWER_REAL_PDF_FIXTURE_PATH="$fixture_path"
}

assert_automation_mode_enabled() {
  local status

  status="$(xcrun automationmodetool 2>&1 || true)"
  if [[ "$status" == *"Automation Mode is disabled"* && "$status" != *"DOES NOT REQUIRE user authentication"* ]]; then
    cat >&2 <<'EOF'
macOS Automation Mode is disabled, so XCTest UI tests cannot run.

Enable it once from a local terminal, then rerun this command:
  sudo xcrun automationmodetool enable-automationmode-without-authentication

The command prompts for your macOS admin password. Codex cannot provide that
password for you.
EOF
    exit 70
  fi

  if [[ "$status" == *"Automation Mode is disabled"* ]]; then
    echo "Automation Mode is disabled, but this machine allows XCTest to enable it without authentication."
  fi
}

cleanup_stale_test_processes() {
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/Acacia.app/Contents/MacOS/Acacia" >/dev/null 2>&1 || true
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/PDFViewer-macOSUITests-Runner.app" >/dev/null 2>&1 || true
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/Acacia-macOSUITests-Runner.app" >/dev/null 2>&1 || true
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

assert_automation_mode_enabled
prepare_real_pdf_fixture

FORCE_BUNDLING=1 xcodebuild "${XCODEBUILD_ARGS[@]}"
