#!/usr/bin/env bash
#
# Attach a processed Acacia build to the matching App Store version row.
#
# Usage:
#   scripts/attach-app-store-version-build.sh [--version VERSION]
#                                             [--build-number NUMBER]
#                                             [--platform MAC_OS|IOS]
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

VERSION="${VERSION:-${APP_STORE_VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}}"
BUILD_NUMBER="${BUILD_NUMBER:-${APP_STORE_BUILD_NUMBER:-1}}"
PLATFORM="${APP_STORE_PLATFORM:-MAC_OS}"
METADATA_PATH="${APP_STORE_UPLOAD_METADATA_PATH:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --build-number) BUILD_NUMBER="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --metadata-path) METADATA_PATH="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/s/^#//p' "$0"
      exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1 ;;
  esac
done

if [[ -n "$METADATA_PATH" && -f "$METADATA_PATH" ]]; then
  VERSION="$(node -e "const m=require('$METADATA_PATH'); console.log(m.marketingVersion || '$VERSION')")"
  BUILD_NUMBER="$(node -e "const m=require('$METADATA_PATH'); console.log(m.buildNumber || '$BUILD_NUMBER')")"
  PLATFORM="$(node -e "const m=require('$METADATA_PATH'); console.log(m.platform || '$PLATFORM')")"
fi

case "$PLATFORM" in
  MAC_OS|IOS) ;;
  *)
    echo "Unsupported platform: $PLATFORM" >&2
    exit 1
    ;;
esac

if [[ -z "${APP_STORE_CONNECT_APP_ID:-}" ]]; then
  echo "APP_STORE_CONNECT_APP_ID is required." >&2
  exit 1
fi

AUTH_ARGS=(--api-key "$APP_STORE_CONNECT_API_KEY_ID" --api-issuer "$APP_STORE_CONNECT_API_ISSUER_ID")
if [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY_PATH:-}" ]]; then
  AUTH_ARGS+=(--p8-file-path "$APP_STORE_CONNECT_API_PRIVATE_KEY_PATH")
elif [[ -n "${APP_STORE_CONNECT_API_PRIVATE_KEY:-}" ]]; then
  AUTH_ARGS+=(--auth-string "$APP_STORE_CONNECT_API_PRIVATE_KEY")
fi

generate_app_store_connect_jwt() {
  local jwt_output jwt_exit jwt

  set +e
  jwt_output="$(xcrun altool --generate-jwt "${AUTH_ARGS[@]}" 2>&1)"
  jwt_exit=$?
  set -e

  if [[ "$jwt_exit" -ne 0 ]]; then
    echo "$jwt_output" >&2
    return "$jwt_exit"
  fi

  jwt="$(JWT_OUTPUT="$jwt_output" node <<'NODE'
const output = process.env.JWT_OUTPUT || '';
const match = output.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
if (match) {
  process.stdout.write(match[0]);
}
NODE
)"

  if [[ -z "$jwt" ]]; then
    echo "Could not parse App Store Connect JWT from altool output." >&2
    return 1
  fi

  printf '%s' "$jwt"
}

ASC_JWT="$(generate_app_store_connect_jwt)"

BUILD_RESPONSE="$(curl -fsS -G "https://api.appstoreconnect.apple.com/v1/builds" \
  -H "Authorization: Bearer $ASC_JWT" \
  --data-urlencode "filter[app]=$APP_STORE_CONNECT_APP_ID" \
  --data-urlencode "filter[version]=$BUILD_NUMBER" \
  --data-urlencode "filter[preReleaseVersion.version]=$VERSION" \
  --data-urlencode "filter[preReleaseVersion.platform]=$PLATFORM" \
  --data-urlencode "limit=1")"

BUILD_ID="$(BUILD_RESPONSE="$BUILD_RESPONSE" node <<'NODE'
const response = JSON.parse(process.env.BUILD_RESPONSE || '{}');
process.stdout.write(response.data?.[0]?.id || '');
NODE
)"

if [[ -z "$BUILD_ID" ]]; then
  echo "No $PLATFORM build found for $VERSION ($BUILD_NUMBER)." >&2
  exit 1
fi

VERSION_RESPONSE="$(curl -fsS -G "https://api.appstoreconnect.apple.com/v1/apps/$APP_STORE_CONNECT_APP_ID/appStoreVersions" \
  -H "Authorization: Bearer $ASC_JWT" \
  --data-urlencode "filter[versionString]=$VERSION" \
  --data-urlencode "filter[platform]=$PLATFORM" \
  --data-urlencode "include=build" \
  --data-urlencode "fields[appStoreVersions]=platform,versionString,appStoreState,build" \
  --data-urlencode "limit=1")"

VERSION_ID="$(VERSION_RESPONSE="$VERSION_RESPONSE" node <<'NODE'
const response = JSON.parse(process.env.VERSION_RESPONSE || '{}');
process.stdout.write(response.data?.[0]?.id || '');
NODE
)"

if [[ -z "$VERSION_ID" ]]; then
  echo "No $PLATFORM App Store version row found for $VERSION." >&2
  exit 1
fi

PAYLOAD="$(mktemp "${TMPDIR:-/tmp}/AcaciaBuildLink.XXXXXX")"
trap 'rm -f "$PAYLOAD"' EXIT

node - "$BUILD_ID" "$PAYLOAD" <<'NODE'
const fs = require('node:fs');
const [buildId, payloadPath] = process.argv.slice(2);
fs.writeFileSync(
  payloadPath,
  `${JSON.stringify({data: {type: 'builds', id: buildId}}, null, 2)}\n`,
);
NODE

curl -fsS -X PATCH "https://api.appstoreconnect.apple.com/v1/appStoreVersions/$VERSION_ID/relationships/build" \
  -H "Authorization: Bearer $ASC_JWT" \
  -H "Content-Type: application/json" \
  --data-binary "@$PAYLOAD" \
  >/dev/null

node - "$APP_STORE_CONNECT_APP_ID" "$BUNDLE_ID" "$VERSION" "$BUILD_NUMBER" "$PLATFORM" "$VERSION_ID" "$BUILD_ID" <<'NODE'
const [appId, bundleId, version, buildNumber, platform, appStoreVersionId, buildId] =
  process.argv.slice(2);

process.stdout.write(
  `${JSON.stringify(
    {
      appId,
      bundleId,
      version,
      buildNumber,
      platform,
      appStoreVersionId,
      buildId,
      attachedBuild: true,
    },
    null,
    2,
  )}\n`,
);
NODE
