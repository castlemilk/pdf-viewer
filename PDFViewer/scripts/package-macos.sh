#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist/macos}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-$(mktemp -d /tmp/PDFViewerPackageDerivedData.XXXXXX)}"
CONFIGURATION="${CONFIGURATION:-Release}"
SCHEME="${SCHEME:-PDFViewer-macOS}"
WORKSPACE="${WORKSPACE:-$ROOT_DIR/macos/PDFViewer.xcworkspace}"
APP_NAME="${APP_NAME:-PDFViewer.app}"
ZIP_NAME="${ZIP_NAME:-PDFViewer-macOS-$CONFIGURATION.zip}"
PACKAGE_ARCHS="${ARCHS:-$(uname -m)}"
XCODEBUILD_ARGS=()

if [[ "${XCODEBUILD_QUIET:-1}" == "1" ]]; then
  XCODEBUILD_ARGS+=("-quiet")
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

xcodebuild \
  "${XCODEBUILD_ARGS[@]}" \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination 'platform=macOS' \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  FORCE_BUNDLING=1 \
  ONLY_ACTIVE_ARCH="${ONLY_ACTIVE_ARCH:-YES}" \
  ARCHS="$PACKAGE_ARCHS" \
  CODE_SIGN_IDENTITY="${CODE_SIGN_IDENTITY:--}" \
  CODE_SIGNING_ALLOWED="${CODE_SIGNING_ALLOWED:-YES}" \
  build

APP_PATH="$DERIVED_DATA_PATH/Build/Products/$CONFIGURATION/$APP_NAME"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Expected app bundle was not found at $APP_PATH" >&2
  exit 1
fi

cp -R "$APP_PATH" "$DIST_DIR/$APP_NAME"
/usr/bin/ditto -c -k --keepParent "$DIST_DIR/$APP_NAME" "$DIST_DIR/$ZIP_NAME"
/usr/bin/shasum -a 256 "$DIST_DIR/$ZIP_NAME" > "$DIST_DIR/$ZIP_NAME.sha256"

echo "Packaged $DIST_DIR/$APP_NAME"
echo "Created $DIST_DIR/$ZIP_NAME"
echo "Checksum $DIST_DIR/$ZIP_NAME.sha256"
