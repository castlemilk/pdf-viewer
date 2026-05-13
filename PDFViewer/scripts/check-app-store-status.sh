#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

VERSION="${VERSION:-${APP_STORE_VERSION:-$(node -p "require('${ROOT_DIR}/package.json').version")}}"
BUILD_NUMBER="${BUILD_NUMBER:-${APP_STORE_BUILD_NUMBER:-1}}"
PLATFORM="${APP_STORE_PLATFORM:-MAC_OS}"
METADATA_PATH="${APP_STORE_UPLOAD_METADATA_PATH:-$ROOT_DIR/dist/app-store/app-store-upload.json}"
USE_DELIVERY_STATUS="${APP_STORE_STATUS_USE_DELIVERY_ID:-0}"

if [[ -f "$METADATA_PATH" ]]; then
  VERSION="$(node -e "const m=require('$METADATA_PATH'); console.log(m.marketingVersion || '$VERSION')")"
  BUILD_NUMBER="$(node -e "const m=require('$METADATA_PATH'); console.log(m.buildNumber || '$BUILD_NUMBER')")"
  PLATFORM="$(node -e "const m=require('$METADATA_PATH'); console.log(m.platform || '$PLATFORM')")"
  DELIVERY_ID="$(node -e "const m=require('$METADATA_PATH'); console.log(m.deliveryId || '')")"
else
  DELIVERY_ID="${APP_STORE_DELIVERY_ID:-}"
fi

if [[ -z "${APP_STORE_CONNECT_APP_ID:-}" ]]; then
  echo "APP_STORE_CONNECT_APP_ID is required for App Store build status checks." >&2
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

if [[ -n "${DELIVERY_ID:-}" && "$USE_DELIVERY_STATUS" == "1" ]]; then
  ARGS=(altool --build-status)
  ARGS+=(--delivery-id "$DELIVERY_ID")
  set +e
  xcrun "${ARGS[@]}" "${AUTH_ARGS[@]}"
  ALTOOL_STATUS_EXIT=$?
  set -e

  if [[ "$ALTOOL_STATUS_EXIT" -eq 0 ]]; then
    exit 0
  fi

  echo "altool delivery status failed; falling back to App Store Connect builds API." >&2
fi

ASC_JWT="$(generate_app_store_connect_jwt)"
BUILD_STATUS_RESPONSE="$(curl -fsS -G "https://api.appstoreconnect.apple.com/v1/builds" \
  -H "Authorization: Bearer $ASC_JWT" \
  --data-urlencode "filter[app]=$APP_STORE_CONNECT_APP_ID" \
  --data-urlencode "filter[version]=$BUILD_NUMBER" \
  --data-urlencode "filter[preReleaseVersion.version]=$VERSION" \
  --data-urlencode "filter[preReleaseVersion.platform]=$PLATFORM" \
  --data-urlencode "include=preReleaseVersion" \
  --data-urlencode "limit=20")"

APP_ID="$APP_STORE_CONNECT_APP_ID" \
BUNDLE_ID_VALUE="$BUNDLE_ID" \
VERSION_VALUE="$VERSION" \
BUILD_NUMBER_VALUE="$BUILD_NUMBER" \
PLATFORM_VALUE="$PLATFORM" \
BUILD_STATUS_RESPONSE="$BUILD_STATUS_RESPONSE" \
node <<'NODE'
const appId = process.env.APP_ID || '';
const bundleId = process.env.BUNDLE_ID_VALUE || '';
const marketingVersion = process.env.VERSION_VALUE || '';
const buildNumber = process.env.BUILD_NUMBER_VALUE || '';
const platform = process.env.PLATFORM_VALUE || '';
const response = JSON.parse(process.env.BUILD_STATUS_RESPONSE || '{}');

const prereleaseVersions = new Map(
  (response.included || [])
    .filter(item => item.type === 'preReleaseVersions')
    .map(item => [item.id, item.attributes?.version || '']),
);

const builds = (response.data || []).map(item => {
  const attributes = item.attributes || {};
  const prereleaseId = item.relationships?.preReleaseVersion?.data?.id || '';
  return {
    id: item.id,
    version: prereleaseVersions.get(prereleaseId) || marketingVersion,
    buildNumber: attributes.version || buildNumber,
    processingState: attributes.processingState || 'UNKNOWN',
    uploadedDate: attributes.uploadedDate || null,
    expired: Boolean(attributes.expired),
  };
});

const matchingBuild =
  builds.find(build => build.version === marketingVersion && build.buildNumber === buildNumber) ||
  builds.find(build => build.buildNumber === buildNumber) ||
  null;

process.stdout.write(
  JSON.stringify(
    {
      source: 'app-store-connect-api',
      appId,
      bundleId,
      marketingVersion,
      buildNumber,
      platform,
      count: builds.length,
      processingState: matchingBuild?.processingState || 'WAITING',
      build: matchingBuild,
      builds,
    },
    null,
    2,
  ),
);
process.stdout.write('\n');
NODE
