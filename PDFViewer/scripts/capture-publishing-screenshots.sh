#!/usr/bin/env bash
#
# Capture App Store screenshots from deterministic launch states.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${APP_PATH:-$ROOT_DIR/.build-release/Acacia.app}"
OUT_DIR="${SCREENSHOT_DIR:-$ROOT_DIR/publishing/screenshots/app-store}"
RECT="${SCREENSHOT_RECT:-80,180,1440,900}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App not found at $APP_PATH. Run npm run publish:macos or set APP_PATH." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

capture_mode() {
  local mode="$1"
  local output="$2"

  pkill -x Acacia >/dev/null 2>&1 || true
  "$APP_PATH/Contents/MacOS/Acacia" --uitesting "--screenshot=$mode" >/tmp/acacia-screenshot.log 2>&1 &
  local pid=$!
  sleep 2

  osascript <<OSA >/dev/null 2>&1 || true
tell application "System Events"
  tell process "Acacia"
    set frontmost to true
    try
      set position of window 1 to {80, 180}
      set size of window 1 to {1440, 900}
    end try
  end tell
end tell
OSA

  sleep 1
  screencapture -x -R"$RECT" "$OUT_DIR/$output"
  kill "$pid" >/dev/null 2>&1 || true
  wait "$pid" >/dev/null 2>&1 || true
}

capture_mode library 01-library.png
capture_mode viewer-info 02-viewer-info.png
capture_mode comments 03-comments-annotations.png
capture_mode compare 04-compare-changes.png

pkill -x Acacia >/dev/null 2>&1 || true

sips -g pixelWidth -g pixelHeight "$OUT_DIR"/*.png
