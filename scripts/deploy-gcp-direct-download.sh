#!/usr/bin/env bash
#
# Create/update Acacia's GCP object-storage download host and static landing page.
#
# Defaults are intentionally local-first and cheap: a regional public GCS bucket
# serves the notarized DMG plus the static Vite landing build.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/PDFViewer"
VERSION="${VERSION:-$(node -p "require('${APP_DIR}/package.json').version")}"
PROJECT_ID="${GCP_PROJECT_ID:-acacia-496104}"
PROJECT_NAME="${GCP_PROJECT_NAME:-Acacia Downloads}"
BILLING_ACCOUNT_ID="${GCP_BILLING_ACCOUNT_ID:-}"
BUCKET="${GCS_BUCKET:-${PROJECT_ID}-downloads}"
LOCATION="${GCS_LOCATION:-australia-southeast1}"

DMG="${APP_DIR}/dist/macos/Acacia-${VERSION}.dmg"
SHA_FILE="${DMG}.sha256"
MANIFEST="${APP_DIR}/dist/macos/Acacia-${VERSION}.manifest.json"

for cmd in gcloud node npm awk du; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required tool not found: $cmd" >&2
    exit 1
  fi
done

if [[ ! -f "$DMG" || ! -f "$SHA_FILE" || ! -f "$MANIFEST" ]]; then
  echo "Missing release artifacts. Run this first:" >&2
  echo "  cd ${APP_DIR} && npm run package:macos:dmg" >&2
  exit 1
fi

if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Creating GCP project: ${PROJECT_ID}"
  gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
fi

if [[ -z "$BILLING_ACCOUNT_ID" ]]; then
  BILLING_ACCOUNT_ID="$(gcloud billing accounts list --filter='open=true' --format='value(ACCOUNT_ID)' | head -1)"
fi

if [[ -n "$BILLING_ACCOUNT_ID" ]]; then
  echo "Linking billing account: ${BILLING_ACCOUNT_ID}"
  gcloud beta billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT_ID" >/dev/null
else
  echo "No open billing account found. Skipping billing link; service enablement may fail." >&2
fi

echo "Enabling Cloud Storage API..."
gcloud services enable storage.googleapis.com --project="$PROJECT_ID" >/dev/null

if ! gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then
  echo "Creating public download bucket: gs://${BUCKET}"
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --uniform-bucket-level-access \
    --no-public-access-prevention
fi

echo "Granting public object read access..."
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member=allUsers \
  --role=roles/storage.objectViewer >/dev/null

DOWNLOAD_URL="https://storage.googleapis.com/${BUCKET}/downloads/Acacia-${VERSION}.dmg"
CHECKSUM_URL="https://storage.googleapis.com/${BUCKET}/downloads/Acacia-${VERSION}.dmg.sha256"
MANIFEST_URL="https://storage.googleapis.com/${BUCKET}/downloads/Acacia-${VERSION}.manifest.json"
SHA256="$(awk '{print $1}' "$SHA_FILE")"
SIZE="$(du -h "$DMG" | awk '{print $1}')"

echo "Uploading release artifacts..."
gcloud storage cp --cache-control="public,max-age=31536000,immutable" "$DMG" "gs://${BUCKET}/downloads/Acacia-${VERSION}.dmg"
gcloud storage cp --cache-control="public,max-age=300" "$SHA_FILE" "gs://${BUCKET}/downloads/Acacia-${VERSION}.dmg.sha256"
gcloud storage cp --cache-control="public,max-age=300" "$MANIFEST" "gs://${BUCKET}/downloads/Acacia-${VERSION}.manifest.json"

echo "Building landing page with direct download URL..."
(
  cd "$ROOT_DIR"
  VITE_DOWNLOAD_VERSION="$VERSION" \
  VITE_DOWNLOAD_URL="$DOWNLOAD_URL" \
  VITE_DOWNLOAD_CHECKSUM_URL="$CHECKSUM_URL" \
  VITE_DOWNLOAD_MANIFEST_URL="$MANIFEST_URL" \
  VITE_DOWNLOAD_SHA256="$SHA256" \
  VITE_DOWNLOAD_SIZE="$SIZE" \
  npm run build
)

echo "Uploading static landing page..."
gcloud storage rsync --recursive "$ROOT_DIR/dist" "gs://${BUCKET}"
gcloud storage buckets update "gs://${BUCKET}" --web-main-page-suffix=index.html --web-error-page=index.html >/dev/null || true

echo ""
echo "Acacia direct download is live:"
echo "  ${DOWNLOAD_URL}"
echo "Landing page:"
echo "  https://storage.googleapis.com/${BUCKET}/index.html"
echo "GCP project:"
echo "  ${PROJECT_ID}"
echo "Bucket:"
echo "  gs://${BUCKET}"
