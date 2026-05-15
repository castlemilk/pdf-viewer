#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESTINATION="${IOS_TEST_DESTINATION:-}"
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

DERIVED_DATA="${IOS_E2E_DERIVED_DATA:-/tmp/AcaciaIOSE2EDerivedData}"

FORCE_BUNDLING=1 \
RCT_NO_LAUNCH_PACKAGER=1 \
xcodebuild test \
  -workspace ios/PDFViewer.xcworkspace \
  -scheme PDFViewer \
  -configuration Release \
  -destination "$DESTINATION" \
  -derivedDataPath "$DERIVED_DATA" \
  ONLY_ACTIVE_ARCH=YES \
  ARCHS="$(uname -m)" \
  CODE_SIGNING_ALLOWED=NO
