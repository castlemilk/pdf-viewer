#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="${RUN_ID:-$$}"
REQUESTED_PORT="${PORT:-}"
PORT="${REQUESTED_PORT:-18080}"
FIREBASE_TOKEN="${ACACIA_E2E_FIREBASE_TOKEN:-acacia-ui-test-token}"
SIGNED_TRANSACTION_JWS="${ACACIA_E2E_SIGNED_TRANSACTION_JWS:-acacia-ui-test-jws}"
SERVER_LOG="${SERVER_LOG:-${TMPDIR:-/tmp}/AcaciaProE2E-${RUN_ID}.log}"
XCTEST_CONFIG_PATH="${ACACIA_PRO_PURCHASE_E2E_CONFIG_PATH:-/tmp/acacia-pro-purchase-e2e-config.plist}"
RESULT_BUNDLE_PATH="${RESULT_BUNDLE_PATH:-${TMPDIR:-/tmp}/Acacia-macOS-Pro-Purchase-${RUN_ID}.xcresult}"
BACKEND_PID=""

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

find_free_port() {
  /usr/bin/python3 <<'PY'
import socket

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
}

if [[ -z "$REQUESTED_PORT" ]] && port_in_use "$PORT"; then
  PORT="$(find_free_port)"
fi

BASE_URL="${ACACIA_PRO_API_BASE_URL:-http://127.0.0.1:${PORT}}"

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$XCTEST_CONFIG_PATH"
}
trap cleanup EXIT

wait_for_backend() {
  local attempt

  for attempt in $(seq 1 80); do
    if [[ -n "$BACKEND_PID" ]] && ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
      echo "Acacia Pro e2e backend exited early. Log:" >&2
      cat "$SERVER_LOG" >&2 || true
      return 1
    fi

    if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
      return 0
    fi

    sleep 0.25
  done

  echo "Timed out waiting for Acacia Pro e2e backend at ${BASE_URL}. Log:" >&2
  cat "$SERVER_LOG" >&2 || true
  return 1
}

write_xctest_config() {
  umask 077
  /usr/bin/python3 - "$XCTEST_CONFIG_PATH" "$BASE_URL" "$FIREBASE_TOKEN" "$SIGNED_TRANSACTION_JWS" <<'PY'
import plistlib
import sys

path, base_url, firebase_token, signed_transaction_jws = sys.argv[1:5]
with open(path, "wb") as handle:
    plistlib.dump(
        {
            "ACACIA_PRO_API_BASE_URL": base_url,
            "ACACIA_FIREBASE_ID_TOKEN": firebase_token,
            "ACACIA_STOREKIT_TEST_SIGNED_JWS": signed_transaction_jws,
        },
        handle,
    )
PY
}

assert_pro_test_ran() {
  local summary_json

  summary_json="$(xcrun xcresulttool get test-results summary --path "$RESULT_BUNDLE_PATH")"
  SUMMARY_JSON="$summary_json" node <<'NODE'
const summary = JSON.parse(process.env.SUMMARY_JSON || '{}');
const total = Number(summary.totalTestCount || 0);
const failed = Number(summary.failedTests || 0);
const skipped = Number(summary.skippedTests || 0);

if (failed > 0 || skipped > 0 || total < 1) {
  console.error(
    `Expected Pro purchase UI test to run without skips; total=${total}, failed=${failed}, skipped=${skipped}`,
  );
  process.exit(65);
}

console.log(`Pro purchase UI test ran: total=${total}, failed=${failed}, skipped=${skipped}`);
NODE
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
export ACACIA_PRO_PURCHASE_E2E_CONFIG_PATH="$XCTEST_CONFIG_PATH"
export ONLY_TESTING="${ONLY_TESTING:-Acacia-macOSUITests/PDFViewerUITests/testProPurchaseFlowActivatesCommentsThroughBackend}"
export RESULT_BUNDLE_PATH="$RESULT_BUNDLE_PATH"

write_xctest_config
scripts/run-macos-e2e.sh
assert_pro_test_ran
