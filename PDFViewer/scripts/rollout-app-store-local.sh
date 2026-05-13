#!/usr/bin/env bash
#
# Greenveil-style local App Store Connect rollout for Acacia.
#
# This validates locally, archives, uploads to App Store Connect, and waits for
# Apple processing. It deliberately does not submit for App Review.
#
# Usage:
#   scripts/rollout-app-store-local.sh [--version VERSION] [--build-number NUMBER]
#                                      [--skip-validation] [--skip-archive]
#                                      [--archive-path PATH] [--no-upload]
#                                      [--no-wait] [--no-attach-build] [--upload-text]
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

VERSION="${VERSION:-${APP_STORE_VERSION:-1.0}}"
BUILD_NUMBER="${BUILD_NUMBER:-${APP_STORE_BUILD_NUMBER:-$(date +%Y%m%d%H%M)}}"
RUN_VALIDATION=1
UPLOAD=1
WAIT_FOR_PROCESSING=1
ATTACH_BUILD=1
UPLOAD_TEXT=0
BUILD_ARGS=()
WAIT_ARGS=()
ATTACH_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      BUILD_ARGS+=("--version" "$2")
      WAIT_ARGS+=("--version" "$2")
      ATTACH_ARGS+=("--version" "$2")
      shift 2
      ;;
    --build-number)
      BUILD_NUMBER="$2"
      BUILD_ARGS+=("--build-number" "$2")
      WAIT_ARGS+=("--build-number" "$2")
      ATTACH_ARGS+=("--build-number" "$2")
      shift 2
      ;;
    --archive-path)
      BUILD_ARGS+=("--archive-path" "$2")
      shift 2
      ;;
    --output)
      BUILD_ARGS+=("--output" "$2")
      shift 2
      ;;
    --skip-validation)
      RUN_VALIDATION=0
      shift
      ;;
    --skip-archive)
      BUILD_ARGS+=("--skip-archive")
      shift
      ;;
    --no-upload)
      UPLOAD=0
      WAIT_FOR_PROCESSING=0
      ATTACH_BUILD=0
      shift
      ;;
    --no-wait)
      WAIT_FOR_PROCESSING=0
      ATTACH_BUILD=0
      shift
      ;;
    --no-attach-build)
      ATTACH_BUILD=0
      shift
      ;;
    --upload-text)
      UPLOAD_TEXT=1
      shift
      ;;
    --wait-attempts)
      WAIT_ARGS+=("--attempts" "$2")
      shift 2
      ;;
    --wait-delay)
      WAIT_ARGS+=("--delay" "$2")
      shift 2
      ;;
    -h|--help)
      sed -n '2,/^$/s/^#//p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "${#BUILD_ARGS[@]}" -eq 0 || " ${BUILD_ARGS[*]} " != *" --version "* ]]; then
  BUILD_ARGS+=("--version" "$VERSION")
fi
if [[ " ${BUILD_ARGS[*]} " != *" --build-number "* ]]; then
  BUILD_ARGS+=("--build-number" "$BUILD_NUMBER")
fi
if [[ " ${WAIT_ARGS[*]} " != *" --version "* ]]; then
  WAIT_ARGS+=("--version" "$VERSION")
fi
if [[ " ${WAIT_ARGS[*]} " != *" --build-number "* ]]; then
  WAIT_ARGS+=("--build-number" "$BUILD_NUMBER")
fi
if [[ " ${ATTACH_ARGS[*]} " != *" --version "* ]]; then
  ATTACH_ARGS+=("--version" "$VERSION")
fi
if [[ " ${ATTACH_ARGS[*]} " != *" --build-number "* ]]; then
  ATTACH_ARGS+=("--build-number" "$BUILD_NUMBER")
fi
if [[ "$UPLOAD" == "1" ]]; then
  BUILD_ARGS+=("--upload")
fi

echo "=== Acacia local App Store Connect rollout ==="
echo "App ID:      ${APP_STORE_CONNECT_APP_ID}"
echo "Bundle ID:   ${BUNDLE_ID}"
echo "Version:     ${VERSION}"
echo "Build:       ${BUILD_NUMBER}"
echo "Validation:  $([[ "$RUN_VALIDATION" == "1" ]] && echo yes || echo no)"
echo "Upload:      $([[ "$UPLOAD" == "1" ]] && echo yes || echo no)"
echo "Wait:        $([[ "$WAIT_FOR_PROCESSING" == "1" ]] && echo yes || echo no)"
echo "Attach:      $([[ "$ATTACH_BUILD" == "1" ]] && echo yes || echo no)"
echo "Text upload: $([[ "$UPLOAD_TEXT" == "1" ]] && echo yes || echo no)"
echo ""

scripts/ensure-apple-bundle-id.sh

if [[ "$RUN_VALIDATION" == "1" ]]; then
  scripts/publish-app-store.sh "${BUILD_ARGS[@]}"
else
  scripts/check-publishing-prereqs.sh
  scripts/build-app-store-archive.sh "${BUILD_ARGS[@]}"
fi

if [[ "$WAIT_FOR_PROCESSING" == "1" ]]; then
  scripts/wait-app-store-build.sh "${WAIT_ARGS[@]}"
fi

if [[ "$ATTACH_BUILD" == "1" ]]; then
  scripts/attach-app-store-version-build.sh "${ATTACH_ARGS[@]}"
fi

if [[ "$UPLOAD_TEXT" == "1" ]]; then
  VERSION="$VERSION" scripts/upload-app-store-text.sh
fi

echo ""
echo "Acacia App Store Connect rollout command finished."
echo "Next manual App Store Connect step: complete review metadata and submit for review."
