#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="${RUN_ID:-$$}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-${TMPDIR:-/tmp}/AcaciaUIDerivedData-${RUN_ID}}"
RESULT_BUNDLE_PATH="${RESULT_BUNDLE_PATH:-${TMPDIR:-/tmp}/Acacia-macOS-UI-${RUN_ID}.xcresult}"
ARCHS="${ARCHS:-$(uname -m)}"
HEARTBEAT_SECONDS="${E2E_HEARTBEAT_SECONDS:-30}"
XCODEBUILD_ARGS=(
  test
  -workspace macos/PDFViewer.xcworkspace
  -scheme PDFViewer-macOS-UI
  -configuration Release
  -destination "platform=macOS,arch=${ARCHS}"
  -derivedDataPath "$DERIVED_DATA_PATH"
  -resultBundlePath "$RESULT_BUNDLE_PATH"
  ONLY_ACTIVE_ARCH=YES
  ARCHS="$ARCHS"
  CODE_SIGN_STYLE=Manual
  CODE_SIGN_IDENTITY=-
  CODE_SIGN_ENTITLEMENTS=
  CODE_SIGNING_REQUIRED=NO
  PROVISIONING_PROFILE_SPECIFIER=
  ENABLE_HARDENED_RUNTIME=NO
  COPY_PHASE_STRIP=NO
  STRIP_INSTALLED_PRODUCT=NO
  TEST_TARGET_NAME="Acacia-macOS"
)

if [[ "${XCODEBUILD_QUIET:-1}" == "1" ]]; then
  XCODEBUILD_ARGS=(test -quiet "${XCODEBUILD_ARGS[@]:1}")
fi

if [[ -n "${ONLY_TESTING:-}" ]]; then
  XCODEBUILD_ARGS+=("-only-testing:${ONLY_TESTING}")
fi

log() {
  printf '[acacia-e2e] %s %s\n' "$(date '+%H:%M:%S')" "$*"
}

print_result_summary() {
  if [[ ! -d "$RESULT_BUNDLE_PATH" ]]; then
    return 0
  fi

  log "Result bundle: $RESULT_BUNDLE_PATH"
  xcrun xcresulttool get test-results summary --path "$RESULT_BUNDLE_PATH" 2>/dev/null || true
}

run_xcodebuild_with_heartbeat() {
  local start_time
  local status
  local pid

  start_time="$(date +%s)"
  log "Starting xcodebuild for PDFViewer-macOS-UI"
  FORCE_BUNDLING=1 xcodebuild "${XCODEBUILD_ARGS[@]}" &
  pid="$!"

  while kill -0 "$pid" >/dev/null 2>&1; do
    sleep "$HEARTBEAT_SECONDS"
    if kill -0 "$pid" >/dev/null 2>&1; then
      log "xcodebuild still running after $(($(date +%s) - start_time))s"
    fi
  done

  set +e
  wait "$pid"
  status="$?"
  set -e

  if [[ "$status" == "0" ]]; then
    log "xcodebuild completed in $(($(date +%s) - start_time))s"
  else
    log "xcodebuild failed with status $status after $(($(date +%s) - start_time))s"
    print_result_summary
  fi

  return "$status"
}

prepare_real_pdf_fixture() {
  local source_path="${PDFVIEWER_REAL_PDF_SOURCE:-$HOME/Downloads/2025 Electronic Pack - Ben Ebsworth.pdf}"
  local fixture_dir="/tmp/AcaciaUITestFixtures"
  local fixture_path="$fixture_dir/2025 Electronic Pack - Ben Ebsworth.pdf"

  if [[ ! -f "$source_path" ]]; then
    log "Real PDF fixture not found at $source_path; skipping fixture copy"
    return 0
  fi

  mkdir -p "$fixture_dir"
  cp "$source_path" "$fixture_path"
  export PDFVIEWER_REAL_PDF_FIXTURE_PATH="$fixture_path"
  log "Prepared real PDF fixture: $fixture_path"
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
    log "Automation Mode is disabled, but this machine allows XCTest to enable it without authentication."
  fi
}

cleanup_stale_test_processes() {
  pkill -x "Acacia" >/dev/null 2>&1 || true
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/Acacia.app/Contents/MacOS/Acacia" >/dev/null 2>&1 || true
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/PDFViewer-macOSUITests-Runner.app" >/dev/null 2>&1 || true
  pkill -f "${DERIVED_DATA_PATH}/Build/Products/Release/Acacia-macOSUITests-Runner.app" >/dev/null 2>&1 || true
}

quit_interfering_apps() {
  local attempt

  osascript -e 'tell application "Simulator" to quit' >/dev/null 2>&1 || true
  pkill -x "SimulatorTrampoline" >/dev/null 2>&1 || true

  for attempt in 1 2 3 4 5; do
    pgrep -x "Simulator" >/dev/null 2>&1 || return 0
    sleep 0.5
  done

  pkill -x "Simulator" >/dev/null 2>&1 || true
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

log "Using derived data: $DERIVED_DATA_PATH"
log "Using result bundle: $RESULT_BUNDLE_PATH"
if [[ -n "${ONLY_TESTING:-}" ]]; then
  log "Only testing: $ONLY_TESTING"
fi

log "Cleaning stale test processes"
cleanup_stale_test_processes
log "Quitting interfering apps"
quit_interfering_apps
log "Removing stale derived data and result bundle"
remove_path "$DERIVED_DATA_PATH"
remove_path "$RESULT_BUNDLE_PATH"

cleanup() {
  cleanup_stale_test_processes
  quit_interfering_apps
  remove_path "$DERIVED_DATA_PATH" || true
}
trap cleanup EXIT

cd "$ROOT_DIR"

assert_automation_mode_enabled
prepare_real_pdf_fixture

run_xcodebuild_with_heartbeat
