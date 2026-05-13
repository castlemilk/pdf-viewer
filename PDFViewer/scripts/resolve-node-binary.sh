#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${NODE_BINARY:-}" && "$NODE_BINARY" != "node" && -x "$NODE_BINARY" ]]; then
  printf '%s\n' "$NODE_BINARY"
  exit 0
fi

if command -v node >/dev/null 2>&1; then
  command -v node
  exit 0
fi

unset PREFIX

if [[ -s "${HOME:-}/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh" --no-use
  nvm use --silent >/dev/null 2>&1 || nvm use --silent default >/dev/null 2>&1 || true
  if command -v node >/dev/null 2>&1; then
    command -v node
    exit 0
  fi
fi

for candidate in \
  "${HOME:-}/.volta/bin/node" \
  "${HOME:-}/.asdf/shims/node" \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  /usr/bin/node
do
  if [[ -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    exit 0
  fi
done

for candidate in "${HOME:-}/.nvm"/versions/node/*/bin/node; do
  if [[ -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    exit 0
  fi
done

cat >&2 <<'EOF'
error: Can't find a usable Node.js binary for the React Native Xcode bundle phase.
Install Node.js or set NODE_BINARY to an absolute node executable path.
EOF
exit 2
