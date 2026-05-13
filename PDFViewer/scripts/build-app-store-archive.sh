#!/usr/bin/env bash
#
# Build a Mac App Store archive for Acacia and optionally upload it to App Store Connect.
#
# Usage:
#   scripts/build-app-store-archive.sh [--version VERSION] [--build-number NUMBER] [--upload] [--skip-archive]
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

VERSION="${VERSION:-${APP_STORE_VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}}"
BUILD_NUMBER="${BUILD_NUMBER:-${APP_STORE_BUILD_NUMBER:-1}}"
OUTPUT_DIR="${APP_STORE_DIST_DIR:-$ROOT_DIR/dist/app-store}"
ARCHIVE_PATH_OVERRIDE="${ARCHIVE_PATH:-}"
EXPORT_PATH_OVERRIDE="${EXPORT_PATH:-}"
ARCHIVE_PATH=""
EXPORT_PATH=""
WORKSPACE="${WORKSPACE:-$ROOT_DIR/macos/PDFViewer.xcworkspace}"
SCHEME="${SCHEME:-PDFViewer-macOS}"
ARCHS="${ARCHS:-arm64 x86_64}"
UPLOAD=0
SKIP_ARCHIVE="${SKIP_ARCHIVE:-0}"
USE_XCODE_ACCOUNT_SIGNING="${APP_STORE_EXPORT_USE_XCODE_ACCOUNT:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --build-number) BUILD_NUMBER="$2"; shift 2 ;;
    --archive-path) ARCHIVE_PATH="$2"; shift 2 ;;
    --output) OUTPUT_DIR="$2"; EXPORT_PATH="$2/export"; shift 2 ;;
    --upload) UPLOAD=1; shift ;;
    --skip-archive) SKIP_ARCHIVE=1; shift ;;
    -h|--help)
      sed -n '2,/^$/s/^#//p' "$0"
      exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1 ;;
  esac
done

if [[ -z "$ARCHIVE_PATH" ]]; then
  ARCHIVE_PATH="${ARCHIVE_PATH_OVERRIDE:-$OUTPUT_DIR/Acacia-${VERSION}-${BUILD_NUMBER}.xcarchive}"
fi

if [[ -z "$EXPORT_PATH" ]]; then
  EXPORT_PATH="${EXPORT_PATH_OVERRIDE:-$OUTPUT_DIR/export}"
fi

if [[ "$USE_XCODE_ACCOUNT_SIGNING" != "1" && ( -z "${APP_STORE_CONNECT_API_KEY_ID:-}" || -z "${APP_STORE_CONNECT_API_ISSUER_ID:-}" ) ]]; then
  echo "Missing App Store Connect API key id or issuer. Configure .env.apple or PDFVIEWER_APPLE_ENV_FILE." >&2
  exit 1
fi

if [[ "$USE_XCODE_ACCOUNT_SIGNING" != "1" && -z "${APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" ]]; then
  echo "APP_STORE_CONNECT_API_PRIVATE_KEY_PATH is required for xcodebuild archive/export authentication." >&2
  exit 1
fi

if [[ "$USE_XCODE_ACCOUNT_SIGNING" != "1" && ! -f "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH" ]]; then
  echo "ASC private key path does not exist: $APP_STORE_CONNECT_API_PRIVATE_KEY_PATH" >&2
  exit 1
fi

HAS_LOCAL_APP_STORE_CERTS=0
if security find-identity -v -p codesigning | grep -Eq "(Apple Distribution|Mac App Distribution): .*\\($DEVELOPMENT_TEAM\\)" &&
   security find-identity -v -p codesigning | grep -Eq "Mac Installer Distribution: .*\\($DEVELOPMENT_TEAM\\)"; then
  HAS_LOCAL_APP_STORE_CERTS=1
fi

if [[ "$HAS_LOCAL_APP_STORE_CERTS" != "1" && "${ALLOW_APP_STORE_CLOUD_SIGNING:-0}" != "1" && "$USE_XCODE_ACCOUNT_SIGNING" != "1" ]]; then
  cat >&2 <<EOF
Mac App Store export is not ready on this machine.

Missing local Mac App Store signing identities for team $DEVELOPMENT_TEAM:
  - Mac App Distribution or Apple Distribution
  - Mac Installer Distribution

Install those certificates in the login keychain, or fix the App Store Connect API
key permissions for cloud signing and rerun with ALLOW_APP_STORE_CLOUD_SIGNING=1.
EOF
  exit 1
fi

AUTHENTICATION_ARGS=()
if [[ "$USE_XCODE_ACCOUNT_SIGNING" != "1" ]]; then
  AUTHENTICATION_ARGS=(
    -authenticationKeyPath "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH"
    -authenticationKeyID "$APP_STORE_CONNECT_API_KEY_ID"
    -authenticationKeyIssuerID "$APP_STORE_CONNECT_API_ISSUER_ID"
  )
fi

repair_react_native_privacy_bundles() {
  local app_path="$1"
  local resources_path="$app_path/Contents/Resources"

  [[ -d "$resources_path" ]] || return 0

  local repaired=0
  while IFS= read -r -d '' bundle_path; do
    if [[ -d "$bundle_path/_CodeSignature" || -d "$bundle_path/Contents/_CodeSignature" ]]; then
      /usr/bin/codesign --remove-signature "$bundle_path"
      repaired=$((repaired + 1))
    fi
  done < <(/usr/bin/find "$resources_path" -maxdepth 1 -type d -name '*_privacy.bundle' -print0)

  if [[ "$repaired" -gt 0 ]]; then
    echo "[archive] Removed stale signatures from $repaired React Native privacy bundles before export"
  fi
}

if [[ "$SKIP_ARCHIVE" == "1" ]]; then
  if [[ ! -d "$ARCHIVE_PATH" ]]; then
    echo "Archive path does not exist for --skip-archive: $ARCHIVE_PATH" >&2
    exit 1
  fi
  mkdir -p "$OUTPUT_DIR"
  rm -rf "$EXPORT_PATH"
else
  rm -rf "$OUTPUT_DIR"
  mkdir -p "$OUTPUT_DIR"
fi

EXPORT_OPTIONS_PLIST="$(mktemp "${TMPDIR:-/tmp}/AcaciaAppStoreExportOptions.XXXXXX")"
DESTINATION="export"
if [[ "$UPLOAD" == "1" ]]; then
  DESTINATION="upload"
fi

cat > "$EXPORT_OPTIONS_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>${DESTINATION}</string>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${DEVELOPMENT_TEAM}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>generateAppStoreInformation</key>
  <true/>
</dict>
</plist>
PLIST

echo "=== Acacia Mac App Store archive ==="
echo "Version:     $VERSION"
echo "Build:       $BUILD_NUMBER"
echo "Bundle ID:   $BUNDLE_ID"
echo "Team:        $DEVELOPMENT_TEAM"
echo "Destination: $DESTINATION"
echo "Signing:     $([[ "$USE_XCODE_ACCOUNT_SIGNING" == "1" ]] && echo 'Xcode account' || echo 'App Store Connect API key')"
echo "Archive:     $ARCHIVE_PATH"
echo ""

if [[ "$SKIP_ARCHIVE" != "1" ]]; then
  ARCHIVE_ARGS=(
    -workspace "$WORKSPACE"
    -scheme "$SCHEME"
    -configuration Release
    -destination 'generic/platform=macOS'
    -archivePath "$ARCHIVE_PATH"
    -allowProvisioningUpdates
    FORCE_BUNDLING=1
    ONLY_ACTIVE_ARCH=NO
    "ARCHS=$ARCHS"
    CODE_SIGN_STYLE=Automatic
    CODE_SIGNING_ALLOWED=YES
    "PRODUCT_BUNDLE_IDENTIFIER=$BUNDLE_ID"
    "MARKETING_VERSION=$VERSION"
    "CURRENT_PROJECT_VERSION=$BUILD_NUMBER"
    "DEVELOPMENT_TEAM=$DEVELOPMENT_TEAM"
    ENABLE_HARDENED_RUNTIME=YES
  )

  if [[ "$USE_XCODE_ACCOUNT_SIGNING" != "1" ]]; then
    ARCHIVE_ARGS+=("${AUTHENTICATION_ARGS[@]}")
  fi
  ARCHIVE_ARGS+=(clean archive)

  xcodebuild "${ARCHIVE_ARGS[@]}"
else
  echo "[archive] Reusing existing archive because --skip-archive is set"
fi

repair_react_native_privacy_bundles "$ARCHIVE_PATH/Products/Applications/Acacia.app"

echo "[export] $DESTINATION via xcodebuild -exportArchive"
EXPORT_ARGS=(
  -exportArchive
  -archivePath "$ARCHIVE_PATH"
  -exportPath "$EXPORT_PATH"
  -exportOptionsPlist "$EXPORT_OPTIONS_PLIST"
  -allowProvisioningUpdates
)
if [[ "$USE_XCODE_ACCOUNT_SIGNING" != "1" ]]; then
  EXPORT_ARGS+=("${AUTHENTICATION_ARGS[@]}")
fi
xcodebuild "${EXPORT_ARGS[@]}"

INFO_PLIST="$ARCHIVE_PATH/Info.plist"
METADATA_PATH="$OUTPUT_DIR/app-store-upload.json"
BUNDLE_VERSION="$(plutil -extract ApplicationProperties.CFBundleVersion raw "$INFO_PLIST" 2>/dev/null || printf '%s' "$BUILD_NUMBER")"
SHORT_VERSION="$(plutil -extract ApplicationProperties.CFBundleShortVersionString raw "$INFO_PLIST" 2>/dev/null || printf '%s' "$VERSION")"
ARCHIVE_BUNDLE_ID="$(plutil -extract ApplicationProperties.CFBundleIdentifier raw "$INFO_PLIST" 2>/dev/null || printf '%s' "$BUNDLE_ID")"
DELIVERY_ID="$(plutil -extract Distributions.0.identifier raw "$INFO_PLIST" 2>/dev/null || true)"

node - "$METADATA_PATH" "$ARCHIVE_PATH" "$EXPORT_PATH" "$ARCHIVE_BUNDLE_ID" "$SHORT_VERSION" "$BUNDLE_VERSION" "$DELIVERY_ID" "$DESTINATION" <<'NODE'
const fs = require('node:fs');
const [path, archivePath, exportPath, bundleId, marketingVersion, buildNumber, deliveryId, destination] = process.argv.slice(2);
const metadata = {
  archivePath,
  exportPath,
  bundleId,
  marketingVersion,
  buildNumber,
  deliveryId: deliveryId || undefined,
  destination,
  updatedAt: new Date().toISOString(),
};
fs.writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`);
NODE

if [[ "$DESTINATION" == "export" ]]; then
  /usr/bin/find "$EXPORT_PATH" -maxdepth 2 -type f -print | while IFS= read -r artifact; do
    /usr/bin/shasum -a 256 "$artifact" > "$artifact.sha256"
  done
fi

echo ""
echo "App Store archive complete:"
echo "  $ARCHIVE_PATH"
echo "  $EXPORT_PATH"
echo "  $METADATA_PATH"
