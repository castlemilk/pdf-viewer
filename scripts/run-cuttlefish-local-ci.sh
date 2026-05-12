#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CUTTLEFISH_DIR="${CUTTLEFISH_DIR:-"${ROOT_DIR}/../cuttlefish"}"
WORKFLOW_PATH="${WORKFLOW_PATH:-"${ROOT_DIR}/workflows/pdf-viewer-ci.yaml"}"
REF="${1:-${CUTTLE_REF:-main}}"
REPO_URL="${CUTTLE_REPO_URL:-https://github.com/castlemilk/pdf-viewer}"
TIMEOUT="${CUTTLE_TIMEOUT:-30m}"

if [ ! -d "$CUTTLEFISH_DIR" ]; then
  echo "Cuttlefish checkout not found: $CUTTLEFISH_DIR" >&2
  exit 1
fi

if [ ! -f "$WORKFLOW_PATH" ]; then
  echo "Workflow not found: $WORKFLOW_PATH" >&2
  exit 1
fi

cd "$CUTTLEFISH_DIR"

if [ ! -f .dev/last-dev-ports.env ]; then
  make up
fi

# shellcheck disable=SC1091
source .dev/last-dev-ports.env

BASE_URL="${CUTTLE_BASE_URL:-http://localhost:${CONTROLPLANE_HOST_PORT:-4444}}"
RUNNER_URL="http://localhost:${RUNNER_HOST_PORT:-5555}"

if ! curl -fsS "${BASE_URL}/readyz" >/dev/null 2>&1; then
  make up
  # shellcheck disable=SC1091
  source .dev/last-dev-ports.env
  BASE_URL="${CUTTLE_BASE_URL:-http://localhost:${CONTROLPLANE_HOST_PORT:-4444}}"
  RUNNER_URL="http://localhost:${RUNNER_HOST_PORT:-5555}"
fi

echo "Cuttlefish control plane: ${BASE_URL}"
echo "Cuttlefish local agent:   ${RUNNER_URL}"
if [ -n "${UI_HOST_PORT:-}" ]; then
  echo "Cuttlefish local UI:      http://localhost:${UI_HOST_PORT}"
fi
echo "Workflow:                ${WORKFLOW_PATH}"
echo "Ref:                     ${REF}"

echo "Preparing local Cuttlefish task packages..."
docker build -t pipeline/checkout:0.2.1 task-packages/pipeline/checkout >/dev/null
docker build -t pipeline/run-script:0.2.0 task-packages/pipeline/run-script >/dev/null
go run ./cmd/cuttle task-packages publish task-packages/pipeline/checkout/manifest.yaml --base-url "$BASE_URL" >/dev/null
go run ./cmd/cuttle task-packages publish task-packages/pipeline/run-script/manifest.yaml --base-url "$BASE_URL" >/dev/null

INPUTS=$(printf '{"repo":"%s","ref":"%s"}' "$REPO_URL" "$REF")

go run ./cmd/cuttle run start \
  --base-url "$BASE_URL" \
  --workflow "$WORKFLOW_PATH" \
  --inputs "$INPUTS" \
  --execution-mode docker \
  --capabilities docker \
  --wait \
  --timeout "$TIMEOUT"
