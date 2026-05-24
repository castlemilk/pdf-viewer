#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/public/app-store-preview-source"
SCREENSHOT_ROOT="$ROOT_DIR/PDFViewer/publishing/screenshots/ios"
OUT_ROOT="$ROOT_DIR/PDFViewer/publishing/app-previews"
TMP_DIR="${TMPDIR:-/tmp}/acacia-app-store-previews"
REMOTION_BIN="$ROOT_DIR/node_modules/.bin/remotion"

copy_sources() {
  rm -rf "$SOURCE_DIR"
  mkdir -p "$SOURCE_DIR/iphone-65" "$SOURCE_DIR/iphone-67" "$SOURCE_DIR/ipad-129"
  cp "$SCREENSHOT_ROOT/iphone-65/"*.png "$SOURCE_DIR/iphone-65/"
  cp "$SCREENSHOT_ROOT/iphone-67/"*.png "$SOURCE_DIR/iphone-67/"
  cp "$SCREENSHOT_ROOT/ipad-129/"*.png "$SOURCE_DIR/ipad-129/"
}

render_preview() {
  local composition="$1"
  local output_dir="$2"
  local output_file="$3"
  local raw_file="$TMP_DIR/$composition-raw.mp4"

  mkdir -p "$output_dir" "$TMP_DIR"
  "$REMOTION_BIN" render \
    "$ROOT_DIR/remotion/index.ts" \
    "$composition" \
    "$raw_file" \
    --codec h264 \
    --pixel-format yuv420p \
    --crf 20

  ffmpeg -y \
    -i "$raw_file" \
    -f lavfi \
    -i anullsrc=channel_layout=stereo:sample_rate=48000 \
    -map 0:v:0 \
    -map 1:a:0 \
    -t 16 \
    -r 30 \
    -vf scale=in_range=pc:out_range=tv,format=yuv420p \
    -c:v libx264 \
    -profile:v high \
    -level:v 4.0 \
    -pix_fmt yuv420p \
    -color_range tv \
    -colorspace bt709 \
    -color_primaries bt709 \
    -color_trc bt709 \
    -b:v 10M \
    -maxrate 12M \
    -bufsize 20M \
    -c:a aac \
    -b:a 256k \
    -ar 48000 \
    -shortest \
    -movflags +faststart \
    "$output_dir/$output_file" >/dev/null 2>&1

  ffprobe -v error \
    -select_streams v:0 \
    -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt \
    -show_entries format=duration,size \
    -of default=noprint_wrappers=1 \
    "$output_dir/$output_file"
}

if [[ ! -x "$REMOTION_BIN" ]]; then
  echo "Remotion binary not found. Run npm install in $ROOT_DIR first." >&2
  exit 1
fi

trap 'rm -rf "$SOURCE_DIR" "$TMP_DIR"' EXIT

copy_sources
render_preview "AcaciaStorePreviewPhone65" "$OUT_ROOT/iphone-65" "01-acacia-preview.mp4"
render_preview "AcaciaStorePreviewPhone67" "$OUT_ROOT/iphone-67" "01-acacia-preview.mp4"
render_preview "AcaciaStorePreviewIpad129" "$OUT_ROOT/ipad-129" "01-acacia-preview.mp4"
