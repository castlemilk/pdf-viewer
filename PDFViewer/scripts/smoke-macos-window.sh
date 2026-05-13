#!/usr/bin/env bash
#
# Launch a macOS app bundle and fail if it stays alive without opening a
# visible main window. This catches the release-blocking "process alive, no UI"
# failure mode that plain process smoke tests miss.
#
# Usage:
#   scripts/smoke-macos-window.sh /Applications/Acacia.app --uitesting
#   scripts/smoke-macos-window.sh --launchservices /Applications/Acacia.app
#
set -euo pipefail

LAUNCH_MODE="binary"
if [[ "${1:-}" == "--launchservices" ]]; then
  LAUNCH_MODE="launchservices"
  shift
fi

APP="${1:?usage: smoke-macos-window.sh [--launchservices] <path-to-app> [launch args...]}"
shift || true

[[ -d "$APP" ]] || { echo "FAIL: app bundle missing: $APP" >&2; exit 1; }
APP="$(cd "$(dirname "$APP")" && pwd -P)/$(basename "$APP")"

INFO_PLIST="$APP/Contents/Info.plist"
EXECUTABLE="$(plutil -extract CFBundleExecutable raw "$INFO_PLIST")"
APP_NAME="$(plutil -extract CFBundleName raw "$INFO_PLIST" 2>/dev/null || basename "$APP" .app)"
APP_BINARY="$APP/Contents/MacOS/$EXECUTABLE"

[[ -x "$APP_BINARY" ]] || { echo "FAIL: app executable missing: $APP_BINARY" >&2; exit 1; }

LOG="$(mktemp -t acacia-window-smoke.XXXXXX.log)"
cleanup() {
  if [[ -n "${PID:-}" ]] && kill -0 "$PID" 2>/dev/null; then
    kill -TERM "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  rm -f "$LOG"
}
trap cleanup EXIT

if [[ "$LAUNCH_MODE" == "launchservices" ]]; then
  if [[ "$#" -gt 0 ]]; then
    /usr/bin/open -n "$APP" --args "$@" >"$LOG" 2>&1
  else
    /usr/bin/open -n "$APP" >"$LOG" 2>&1
  fi

  for _ in {1..20}; do
    PID="$(
      for candidate in $(/usr/bin/pgrep -x "$EXECUTABLE" || true); do
        command="$(/bin/ps -ww -p "$candidate" -o command= 2>/dev/null || true)"
        if [[ "$command" == "$APP_BINARY"* ]]; then
          echo "$candidate"
        fi
      done | /usr/bin/tail -n 1
    )"
    [[ -n "${PID:-}" ]] && break
    sleep 0.25
  done
  if [[ -z "${PID:-}" ]]; then
    echo "FAIL: LaunchServices did not start $APP_NAME. Log:" >&2
    sed 's/^/    /' "$LOG" >&2
    exit 1
  fi
else
  "$APP_BINARY" "$@" >"$LOG" 2>&1 &
  PID=$!
fi

has_visible_window() {
  /usr/bin/swift - "$PID" <<'SWIFT'
import CoreGraphics
import Foundation

guard CommandLine.arguments.count > 1, let targetPID = Int(CommandLine.arguments[1]) else {
  exit(2)
}

let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []

for window in windows {
  guard let ownerPID = window[kCGWindowOwnerPID as String] as? Int, ownerPID == targetPID else {
    continue
  }

  let layer = window[kCGWindowLayer as String] as? Int ?? 0
  let alpha = window[kCGWindowAlpha as String] as? Double ?? 1
  let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
  let width = bounds["Width"] as? Double ?? 0
  let height = bounds["Height"] as? Double ?? 0

  if layer == 0 && alpha > 0 && width >= 320 && height >= 240 {
    let name = window[kCGWindowName as String] as? String ?? "(untitled)"
    print("  visible window: \(name) \(Int(width))x\(Int(height))")
    exit(0)
  }
}

exit(1)
SWIFT
}

for _ in {1..30}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "FAIL: $APP_NAME exited before a window opened. Log:" >&2
    sed 's/^/    /' "$LOG" >&2
    exit 1
  fi

  process_state="$(/bin/ps -o stat= -p "$PID" 2>/dev/null | /usr/bin/tr -d '[:space:]' || true)"
  if [[ "$process_state" == T* ]]; then
    echo "FAIL: $APP_NAME launched in a stopped/suspended state. Log:" >&2
    sed 's/^/    /' "$LOG" >&2
    exit 1
  fi

  if has_visible_window; then
    echo "  $APP_NAME opened a visible window"
    exit 0
  fi

  sleep 1
done

echo "FAIL: $APP_NAME stayed alive but did not open a visible window. Log:" >&2
sed 's/^/    /' "$LOG" >&2
exit 1
