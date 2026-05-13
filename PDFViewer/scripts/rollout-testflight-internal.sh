#!/usr/bin/env bash
#
# Link the latest valid Acacia build to an internal TestFlight group.
#
# Usage:
#   scripts/rollout-testflight-internal.sh [--version VERSION] [--build-number NUMBER]
#                                       [--platform MAC_OS|IOS]
#                                       [--group-name NAME] [--tester-emails CSV]
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load-apple-publishing-env.sh"

exec node "$ROOT_DIR/scripts/rollout-testflight-internal.mjs" "$@"
