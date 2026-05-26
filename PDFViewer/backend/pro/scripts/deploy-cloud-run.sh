#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${FIREBASE_PROJECT_ID:=$GCP_PROJECT_ID}"
: "${ACACIA_ENTITLEMENTS_BUCKET:?Set ACACIA_ENTITLEMENTS_BUCKET}"
: "${ACACIA_CLOUD_BUCKET:=$ACACIA_ENTITLEMENTS_BUCKET}"
: "${ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET:?Set ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET to the Secret Manager secret containing the app account token HMAC secret}"

SERVICE_NAME="${SERVICE_NAME:-acacia-pro}"
REGION="${REGION:-australia-southeast1}"
ENTITLEMENTS_PREFIX="${ACACIA_ENTITLEMENTS_PREFIX:-pro}"
CLOUD_PREFIX="${ACACIA_CLOUD_PREFIX:-pro}"
BUCKET_LOCATION="${GCS_LOCATION:-australia-southeast1}"
PROJECT_NUMBER="$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_SERVICE_ACCOUNT="${CLOUD_RUN_SERVICE_ACCOUNT:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

ENV_VARS=(
  "FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}"
  "ACACIA_ENTITLEMENTS_BUCKET=${ACACIA_ENTITLEMENTS_BUCKET}"
  "ACACIA_ENTITLEMENTS_PREFIX=${ENTITLEMENTS_PREFIX}"
  "ACACIA_CLOUD_BUCKET=${ACACIA_CLOUD_BUCKET}"
  "ACACIA_CLOUD_PREFIX=${CLOUD_PREFIX}"
)

SECRET_ARGS=()
SECRET_ARGS+=(--update-secrets "ACACIA_APP_ACCOUNT_TOKEN_SECRET=${ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET}:latest")
if [[ -n "${ACACIA_ADMIN_TOKEN_SECRET:-}" ]]; then
  SECRET_ARGS+=(--update-secrets "ACACIA_ADMIN_TOKEN=${ACACIA_ADMIN_TOKEN_SECRET}:latest")
fi

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  --project "${GCP_PROJECT_ID}" >/dev/null

if ! gcloud storage buckets describe "gs://${ACACIA_ENTITLEMENTS_BUCKET}" --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${ACACIA_ENTITLEMENTS_BUCKET}" \
    --project "${GCP_PROJECT_ID}" \
    --location "${BUCKET_LOCATION}" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

if ! gcloud storage buckets describe "gs://${ACACIA_CLOUD_BUCKET}" --project "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${ACACIA_CLOUD_BUCKET}" \
    --project "${GCP_PROJECT_ID}" \
    --location "${BUCKET_LOCATION}" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

gcloud storage buckets add-iam-policy-binding "gs://${ACACIA_ENTITLEMENTS_BUCKET}" \
  --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role roles/storage.objectAdmin \
  --project "${GCP_PROJECT_ID}" >/dev/null

if [[ "${ACACIA_CLOUD_BUCKET}" != "${ACACIA_ENTITLEMENTS_BUCKET}" ]]; then
  gcloud storage buckets add-iam-policy-binding "gs://${ACACIA_CLOUD_BUCKET}" \
    --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
    --role roles/storage.objectAdmin \
    --project "${GCP_PROJECT_ID}" >/dev/null
fi

gcloud secrets add-iam-policy-binding "${ACACIA_APP_ACCOUNT_TOKEN_SECRET_SECRET}" \
  --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role roles/secretmanager.secretAccessor \
  --project "${GCP_PROJECT_ID}" >/dev/null

if [[ -n "${ACACIA_ADMIN_TOKEN_SECRET:-}" ]]; then
  gcloud secrets add-iam-policy-binding "${ACACIA_ADMIN_TOKEN_SECRET}" \
    --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
    --role roles/secretmanager.secretAccessor \
    --project "${GCP_PROJECT_ID}" >/dev/null
fi

gcloud run deploy "${SERVICE_NAME}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${REGION}" \
  --source "${ROOT_DIR}" \
  --service-account "${RUNTIME_SERVICE_ACCOUNT}" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances "${MAX_INSTANCES:-10}" \
  --cpu "${CPU:-1}" \
  --memory "${MEMORY:-256Mi}" \
  --set-env-vars "$(IFS=,; echo "${ENV_VARS[*]}")" \
  "${SECRET_ARGS[@]}"
