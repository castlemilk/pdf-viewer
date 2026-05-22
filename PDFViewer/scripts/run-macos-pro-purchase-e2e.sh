#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="${RUN_ID:-$$}"
PORT="${PORT:-18080}"
BASE_URL="${ACACIA_PRO_API_BASE_URL:-http://127.0.0.1:${PORT}}"
FIREBASE_TOKEN="${ACACIA_E2E_FIREBASE_TOKEN:-acacia-ui-test-token}"
SIGNED_TRANSACTION_JWS="${ACACIA_E2E_SIGNED_TRANSACTION_JWS:-acacia-ui-test-jws}"
SERVER_LOG="${SERVER_LOG:-${TMPDIR:-/tmp}/AcaciaProE2E-${RUN_ID}.log}"
BACKEND_PID=""

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_backend() {
  local attempt

  for attempt in $(seq 1 80); do
    if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
      return 0
    fi

    if [[ -n "$BACKEND_PID" ]] && ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
      echo "Acacia Pro e2e backend exited early. Log:" >&2
      cat "$SERVER_LOG" >&2 || true
      return 1
    fi

    sleep 0.25
  done

  echo "Timed out waiting for Acacia Pro e2e backend at ${BASE_URL}. Log:" >&2
  cat "$SERVER_LOG" >&2 || true
  return 1
}

cd "$ROOT_DIR/backend/pro"
PORT="$PORT" \
ACACIA_E2E_FIREBASE_TOKEN="$FIREBASE_TOKEN" \
ACACIA_E2E_SIGNED_TRANSACTION_JWS="$SIGNED_TRANSACTION_JWS" \
go run ./cmd/acacia-pro-e2e >"$SERVER_LOG" 2>&1 &
BACKEND_PID="$!"

wait_for_backend

cd "$ROOT_DIR"
export ACACIA_PRO_API_BASE_URL="$BASE_URL"
export ACACIA_FIREBASE_ID_TOKEN="$FIREBASE_TOKEN"
export ACACIA_STOREKIT_TEST_SIGNED_JWS="$SIGNED_TRANSACTION_JWS"
export ONLY_TESTING="${ONLY_TESTING:-Acacia-macOSUITests/PDFViewerUITests/testProPurchaseFlowActivatesCommentsThroughBackend}"

scripts/run-macos-e2e.sh
