#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${ACACIA_PRO_BASE_URL:?Set ACACIA_PRO_BASE_URL to the Cloud Run service URL}"
: "${ACACIA_FIREBASE_ID_TOKEN:?Set ACACIA_FIREBASE_ID_TOKEN to a Firebase Auth ID token for a smoke user}"

cd "${ROOT_DIR}"
go run ./cmd/acacia-pro-smoke

