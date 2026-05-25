#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_ID="${RUN_ID:-$$}"
HEARTBEAT_SECONDS="${E2E_HEARTBEAT_SECONDS:-30}"
DERIVED_DATA="${IOS_E2E_DERIVED_DATA:-/tmp/AcaciaIOSE2EDerivedData-${RUN_ID}}"
RESULT_BUNDLE_PATH="${RESULT_BUNDLE_PATH:-${TMPDIR:-/tmp}/Acacia-iOS-UI-${RUN_ID}.xcresult}"
DESTINATION="${IOS_TEST_DESTINATION:-}"

log() {
  printf '[acacia-ios-e2e] %s %s\n' "$(date '+%H:%M:%S')" "$*"
}

print_result_summary() {
  if [[ ! -d "$RESULT_BUNDLE_PATH" ]]; then
    return 0
  fi

  log "Result bundle: $RESULT_BUNDLE_PATH"
  xcrun xcresulttool get test-results summary --path "$RESULT_BUNDLE_PATH" 2>/dev/null || true
}

if [ -z "$DESTINATION" ]; then
  PREFERRED_SIMULATOR_ID=""
  for SIMULATOR_NAME in "iPhone 16 Pro" "iPhone 17" "iPhone 15 Pro"; do
    PREFERRED_SIMULATOR_ID="$(
      xcrun simctl list devices available |
        sed -n "s/.*${SIMULATOR_NAME} (\([A-F0-9-]\{36\}\)).*/\1/p" |
        head -n 1
    )"
    if [ -n "$PREFERRED_SIMULATOR_ID" ]; then
      break
    fi
  done

  if [ -n "$PREFERRED_SIMULATOR_ID" ]; then
    DESTINATION="platform=iOS Simulator,id=$PREFERRED_SIMULATOR_ID"
  else
    BOOTED_SIMULATOR_ID="$(xcrun simctl list devices booted | sed -n 's/.*(\([A-F0-9-]\{36\}\)) (Booted).*/\1/p' | head -n 1)"
    if [ -n "$BOOTED_SIMULATOR_ID" ]; then
      DESTINATION="platform=iOS Simulator,id=$BOOTED_SIMULATOR_ID"
    else
      DESTINATION="platform=iOS Simulator,name=iPhone 17"
    fi
  fi
fi

XCODEBUILD_ARGS=(
  test
  -workspace ios/PDFViewer.xcworkspace
  -scheme PDFViewer
  -configuration Release
  -destination "$DESTINATION"
  -derivedDataPath "$DERIVED_DATA"
  -resultBundlePath "$RESULT_BUNDLE_PATH"
  ONLY_ACTIVE_ARCH=YES
  ARCHS="$(uname -m)"
  CODE_SIGNING_ALLOWED=NO
)

if [[ -n "${ONLY_TESTING:-}" ]]; then
  XCODEBUILD_ARGS+=("-only-testing:${ONLY_TESTING}")
fi

run_xcodebuild_with_heartbeat() {
  local start_time
  local status
  local pid

  start_time="$(date +%s)"
  log "Starting xcodebuild for iOS UI tests"
  FORCE_BUNDLING=1 RCT_NO_LAUNCH_PACKAGER=1 xcodebuild "${XCODEBUILD_ARGS[@]}" &
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

log "Using destination: $DESTINATION"
log "Using derived data: $DERIVED_DATA"
log "Using result bundle: $RESULT_BUNDLE_PATH"
if [[ -n "${ONLY_TESTING:-}" ]]; then
  log "Only testing: $ONLY_TESTING"
fi

run_xcodebuild_with_heartbeat
