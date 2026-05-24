#!/usr/bin/env bash
#
# Capture iPhone and iPad App Store screenshots from deterministic simulator states.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="${ROOT_DIR}/ios/PDFViewer.xcworkspace"
SCHEME="${IOS_SCREENSHOT_SCHEME:-PDFViewer}"
CONFIGURATION="${IOS_SCREENSHOT_CONFIGURATION:-Release}"
DERIVED_DATA="${IOS_SCREENSHOT_DERIVED_DATA:-/tmp/AcaciaIOSScreenshotDerivedData}"
APP_PATH="${IOS_SCREENSHOT_APP_PATH:-$DERIVED_DATA/Build/Products/${CONFIGURATION}-iphonesimulator/Acacia.app}"
BUNDLE_ID="${IOS_SCREENSHOT_BUNDLE_ID:-com.benebsworth.acacia}"
IPHONE_65_DEVICE="${IOS_SCREENSHOT_IPHONE_65_DEVICE:-${IOS_SCREENSHOT_IPHONE_DEVICE:-iPhone 14 Plus}}"
IPHONE_67_DEVICE="${IOS_SCREENSHOT_IPHONE_67_DEVICE:-iPhone 15 Plus}"
IPAD_DEVICE="${IOS_SCREENSHOT_IPAD_DEVICE:-iPad Pro 13-inch (M4)}"
IPHONE_65_RUNTIME="${IOS_SCREENSHOT_IPHONE_65_RUNTIME:-${IOS_SCREENSHOT_IPHONE_RUNTIME:-iOS 17.0}}"
IPHONE_67_RUNTIME="${IOS_SCREENSHOT_IPHONE_67_RUNTIME:-iOS 17.0}"
IPAD_RUNTIME="${IOS_SCREENSHOT_IPAD_RUNTIME:-iOS 18.3}"
OUT_ROOT="${IOS_SCREENSHOT_OUTPUT_DIR:-$ROOT_DIR/publishing/screenshots/ios}"
MODES=(
  "library:01-library.png"
  "viewer-info:02-viewer.png"
  "comments:03-annotations.png"
  "compare:04-compare.png"
)

find_device() {
  local name="$1"
  local runtime="$2"

  xcrun simctl list devices available | awk -v name="$name" -v runtime="-- $runtime --" '
    $0 == runtime {inRuntime = 1; next}
    /^-- / {inRuntime = 0}
    inRuntime && index($0, name " (") {
      if (match($0, /\([0-9A-F-]{36}\)/)) {
        print substr($0, RSTART + 1, RLENGTH - 2)
        exit
      }
    }
  '
}

capture_set() {
  local device_name="$1"
  local runtime="$2"
  local output_dir="$3"
  local udid

  udid="$(find_device "$device_name" "$runtime")"
  if [[ -z "$udid" ]]; then
    echo "Could not find available simulator '$device_name' on '$runtime'." >&2
    exit 1
  fi

  mkdir -p "$output_dir"
  xcrun simctl boot "$udid" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl status_bar "$udid" override \
    --time "9:41" \
    --wifiBars 3 \
    --cellularBars 4 \
    --batteryState charged \
    --batteryLevel 100 >/dev/null 2>&1 || true
  xcrun simctl install "$udid" "$APP_PATH"

  for entry in "${MODES[@]}"; do
    local mode="${entry%%:*}"
    local file_name="${entry#*:}"
    SIMCTL_CHILD_PDFVIEWER_UITESTING=1 \
      SIMCTL_CHILD_PDFVIEWER_RESET_STATE=1 \
      xcrun simctl launch \
        --terminate-running-process \
        "$udid" \
        "$BUNDLE_ID" \
        --uitesting \
        "--screenshot=$mode" >/dev/null
    sleep 4
    xcrun simctl io "$udid" screenshot "$output_dir/$file_name" >/dev/null
  done

  xcrun simctl terminate "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl status_bar "$udid" clear >/dev/null 2>&1 || true
}

rm -rf "$DERIVED_DATA"
mkdir -p "$OUT_ROOT"

echo "Building Acacia for iOS Simulator screenshots..."
xcodebuild \
  -quiet \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$DERIVED_DATA" \
  FORCE_BUNDLING=1 \
  ONLY_ACTIVE_ARCH=YES \
  ARCHS="$(uname -m)" \
  build

if [[ ! -d "$APP_PATH" ]]; then
  echo "Expected simulator app was not found at $APP_PATH" >&2
  exit 1
fi

capture_set "$IPHONE_65_DEVICE" "$IPHONE_65_RUNTIME" "$OUT_ROOT/iphone-65"
capture_set "$IPHONE_67_DEVICE" "$IPHONE_67_RUNTIME" "$OUT_ROOT/iphone-67"
capture_set "$IPAD_DEVICE" "$IPAD_RUNTIME" "$OUT_ROOT/ipad-129"

sips -g pixelWidth -g pixelHeight "$OUT_ROOT"/iphone-65/*.png "$OUT_ROOT"/iphone-67/*.png "$OUT_ROOT"/ipad-129/*.png
