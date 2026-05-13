#!/usr/bin/env bash
#
# Build a signed macOS release DMG for local publication.
#
# Usage:
#   scripts/build-release-dmg.sh [--version VERSION] [--build-number NUMBER]
#                                [--sign IDENTITY] [--notarize PROFILE]
#                                [--output DIR] [--skip-notarize]
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Acacia"
BUNDLE_ID="${BUNDLE_ID:-com.benebsworth.acacia}"
TEAM_ID="${DEVELOPMENT_TEAM:-WFTX6CN23F}"
VERSION="${VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
SIGN_IDENTITY="${CODE_SIGN_IDENTITY:-}"
NOTARIZE_PROFILE="${NOTARY_PROFILE:-brandbrain}"
OUTPUT_DIR="${DIST_DIR:-${ROOT_DIR}/dist/macos}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-$(mktemp -d /tmp/AcaciaReleaseDerivedData.XXXXXX)}"
WORKSPACE="${WORKSPACE:-${ROOT_DIR}/macos/PDFViewer.xcworkspace}"
SCHEME="${SCHEME:-PDFViewer-macOS}"
ARCHS="${ARCHS:-arm64 x86_64}"
ONLY_ACTIVE_ARCH="${ONLY_ACTIVE_ARCH:-NO}"
SKIP_NOTARIZE="${SKIP_NOTARIZATION:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --build-number) BUILD_NUMBER="$2"; shift 2 ;;
    --sign) SIGN_IDENTITY="$2"; shift 2 ;;
    --notarize) NOTARIZE_PROFILE="$2"; SKIP_NOTARIZE=0; shift 2 ;;
    --output) OUTPUT_DIR="$2"; shift 2 ;;
    --skip-notarize) SKIP_NOTARIZE=1; shift ;;
    -h|--help)
      sed -n '2,/^$/s/^#//p' "$0"
      exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1 ;;
  esac
done

for cmd in xcodebuild codesign hdiutil create-dmg xcrun ditto shasum plutil; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required tool not found: $cmd" >&2
    [[ "$cmd" == "create-dmg" ]] && echo "Install with: brew install create-dmg" >&2
    exit 1
  fi
done

if [[ -z "$SIGN_IDENTITY" ]]; then
  SIGN_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' \
    | head -1)"
fi

if [[ -z "$SIGN_IDENTITY" ]]; then
  echo "No Developer ID Application signing identity found. Set CODE_SIGN_IDENTITY to publish." >&2
  exit 1
fi

if [[ "$SKIP_NOTARIZE" != "1" ]]; then
  xcrun notarytool history --keychain-profile "$NOTARIZE_PROFILE" --output-format json >/dev/null
fi

STAGE_DIR="${ROOT_DIR}/.build-release"
APP_SOURCE="${DERIVED_DATA_PATH}/Build/Products/Release/${APP_NAME}.app"
APP_BUNDLE="${STAGE_DIR}/${APP_NAME}.app"
DMG_PATH="${OUTPUT_DIR}/${APP_NAME}-${VERSION}.dmg"
ZIP_PATH="${OUTPUT_DIR}/${APP_NAME}-${VERSION}.zip"
MANIFEST_PATH="${OUTPUT_DIR}/${APP_NAME}-${VERSION}.manifest.json"
ENTITLEMENTS="${ROOT_DIR}/macos/PDFViewer-macOS/PDFViewer.entitlements"

rm -rf "$STAGE_DIR"
rm -rf "$OUTPUT_DIR"
mkdir -p "$STAGE_DIR" "$OUTPUT_DIR"

echo "=== Acacia macOS release builder ==="
echo "Version:  ${VERSION}"
echo "Build:    ${BUILD_NUMBER}"
echo "Bundle:   ${BUNDLE_ID}"
echo "Team:     ${TEAM_ID}"
echo "Archs:    ${ARCHS}"
echo "Sign:     ${SIGN_IDENTITY}"
if [[ "$SKIP_NOTARIZE" == "1" ]]; then
  echo "Notary:   skipped"
else
  echo "Notary:   ${NOTARIZE_PROFILE}"
fi
echo ""

echo "[1/7] Building Release app..."
xcodebuild \
  -quiet \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'platform=macOS' \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  FORCE_BUNDLING=1 \
  ONLY_ACTIVE_ARCH="$ONLY_ACTIVE_ARCH" \
  ARCHS="$ARCHS" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  MARKETING_VERSION="$VERSION" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  ENABLE_HARDENED_RUNTIME=YES \
  build

if [[ ! -d "$APP_SOURCE" ]]; then
  echo "Expected app bundle was not found at $APP_SOURCE" >&2
  exit 1
fi

cp -R "$APP_SOURCE" "$APP_BUNDLE"
/usr/bin/xattr -cr "$APP_BUNDLE"

echo "[2/7] Normalizing Info.plist..."
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${BUNDLE_ID}" "$APP_BUNDLE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${VERSION}" "$APP_BUNDLE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${BUILD_NUMBER}" "$APP_BUNDLE/Contents/Info.plist"

echo "[3/7] Code signing app bundle..."
if [[ -d "$APP_BUNDLE/Contents/Frameworks" ]]; then
  while IFS= read -r executable; do
    codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$executable"
  done < <(/usr/bin/find "$APP_BUNDLE/Contents/Frameworks" -type f \( -name "*.dylib" -o -perm +111 \) ! -path "*/_CodeSignature/*")

  while IFS= read -r bundle; do
    codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$bundle"
  done < <(/usr/bin/find "$APP_BUNDLE/Contents/Frameworks" -depth -type d \( -name "*.framework" -o -name "*.xpc" -o -name "*.app" \))
fi

if [[ -d "$APP_BUNDLE/Contents/PlugIns" ]]; then
  while IFS= read -r plugin; do
    codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$plugin"
  done < <(/usr/bin/find "$APP_BUNDLE/Contents/PlugIns" -depth -type d \( -name "*.appex" -o -name "*.xpc" -o -name "*.bundle" \))
fi

codesign --force --options runtime --timestamp \
  --entitlements "$ENTITLEMENTS" \
  --sign "$SIGN_IDENTITY" \
  "$APP_BUNDLE"

codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

echo "[4/7] Creating distributable ZIP..."
( cd "$STAGE_DIR" && /usr/bin/ditto -c -k --keepParent --sequesterRsrc "${APP_NAME}.app" "$ZIP_PATH" )

echo "[5/7] Creating DMG..."
rm -f "$DMG_PATH"
create-dmg \
  --volname "$APP_NAME" \
  --window-pos 200 120 \
  --window-size 620 420 \
  --icon-size 100 \
  --icon "${APP_NAME}.app" 160 190 \
  --hide-extension "${APP_NAME}.app" \
  --app-drop-link 460 190 \
  "$DMG_PATH" \
  "$STAGE_DIR/" \
  || [[ $? -eq 2 ]]

codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG_PATH"

if [[ "$SKIP_NOTARIZE" != "1" ]]; then
  echo "[6/7] Submitting DMG for notarization..."
  xcrun notarytool submit "$DMG_PATH" \
    --keychain-profile "$NOTARIZE_PROFILE" \
    --wait

  echo "Stapling notarization ticket..."
  xcrun stapler staple "$DMG_PATH"
  xcrun stapler validate "$DMG_PATH"
else
  echo "[6/7] Notarization skipped."
fi

echo "[7/7] Writing checksums and manifest..."
/usr/bin/shasum -a 256 "$DMG_PATH" > "${DMG_PATH}.sha256"
/usr/bin/shasum -a 256 "$ZIP_PATH" > "${ZIP_PATH}.sha256"

APP_TEAM="$(codesign -dv "$APP_BUNDLE" 2>&1 | awk -F= '/TeamIdentifier/{print $2}')"
cat > "$MANIFEST_PATH" <<JSON
{
  "app": "${APP_NAME}",
  "version": "${VERSION}",
  "buildNumber": "${BUILD_NUMBER}",
  "bundleId": "${BUNDLE_ID}",
  "teamId": "${APP_TEAM}",
  "notarized": $([[ "$SKIP_NOTARIZE" == "1" ]] && echo false || echo true),
  "artifacts": {
    "dmg": "$(basename "$DMG_PATH")",
    "zip": "$(basename "$ZIP_PATH")"
  }
}
JSON

echo ""
echo "Release artifacts:"
echo "  ${DMG_PATH}"
echo "  ${ZIP_PATH}"
echo "  ${MANIFEST_PATH}"
