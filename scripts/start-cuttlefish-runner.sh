#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

GITHUB_REPO="${GITHUB_REPO:-castlemilk/pdf-viewer}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,cuttlefish,macOS,pdf-viewer}"
RUNNER_NAME="${RUNNER_NAME:-cuttlefish-pdf-viewer-launchd}"
CUTTLEFISH_PROJECT="${CUTTLEFISH_PROJECT:-pdf-viewer}"
CUTTLEFISH_DIR="${CUTTLEFISH_DIR:-${REPO_ROOT}/../cuttlefish}"
RUNNER_DOWNLOAD_TIMEOUT="${RUNNER_DOWNLOAD_TIMEOUT:-15m}"

if [[ ! -d "${CUTTLEFISH_DIR}" ]]; then
  echo "Cuttlefish checkout not found at ${CUTTLEFISH_DIR}" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required to mint a runner registration token." >&2
  exit 1
fi

echo "$(date +%Y-%m-%dT%H:%M:%S%z) minting GitHub Actions runner registration token"
REGISTRATION_TOKEN="$(
  gh api -X POST "repos/${GITHUB_REPO}/actions/runners/registration-token" --jq .token
)"

echo "$(date +%Y-%m-%dT%H:%M:%S%z) starting Cuttlefish GitHub runner for ${GITHUB_REPO}"
cd "${CUTTLEFISH_DIR}"
exec go run ./cmd/cuttle agent github-runner register \
  --project "${CUTTLEFISH_PROJECT}" \
  --repo "${GITHUB_REPO}" \
  --name "${RUNNER_NAME}" \
  --labels "${RUNNER_LABELS}" \
  --download-timeout "${RUNNER_DOWNLOAD_TIMEOUT}" \
  --token "${REGISTRATION_TOKEN}"
