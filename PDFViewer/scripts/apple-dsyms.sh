#!/usr/bin/env bash

archive_dsym_uuids() {
  local target="$1"

  if [[ ! -e "$target" ]]; then
    return 1
  fi

  /usr/bin/xcrun dwarfdump --uuid "$target" 2>/dev/null | /usr/bin/awk '{print $2}' | /usr/bin/sort
}

archive_dsym_matches_binary() {
  local binary_path="$1"
  local dsym_path="$2"

  [[ -f "$binary_path" && -d "$dsym_path" ]] || return 1

  local binary_uuids
  local dsym_uuids
  binary_uuids="$(archive_dsym_uuids "$binary_path")" || return 1
  dsym_uuids="$(archive_dsym_uuids "$dsym_path")" || return 1

  [[ -n "$binary_uuids" && "$binary_uuids" == "$dsym_uuids" ]]
}

ensure_archive_dsym() {
  local archive_path="$1"
  local binary_path="$2"
  local dsym_name="$3"
  local dsym_dir="$archive_path/dSYMs"
  local dsym_path="$dsym_dir/$dsym_name"

  if [[ ! -f "$binary_path" ]]; then
    echo "[dsyms] Skipping missing binary: $binary_path"
    return 0
  fi

  mkdir -p "$dsym_dir"

  if archive_dsym_matches_binary "$binary_path" "$dsym_path"; then
    echo "[dsyms] Verified $dsym_name"
    return 0
  fi

  rm -rf "$dsym_path"
  echo "[dsyms] Generating $dsym_name"
  local dsym_log
  dsym_log="$(mktemp "${TMPDIR:-/tmp}/AcaciaDsymutil.XXXXXX")"
  if ! /usr/bin/xcrun dsymutil "$binary_path" -o "$dsym_path" >"$dsym_log" 2>&1; then
    cat "$dsym_log" >&2
    rm -f "$dsym_log"
    return 1
  fi
  rm -f "$dsym_log"

  if ! archive_dsym_matches_binary "$binary_path" "$dsym_path"; then
    echo "[dsyms] Generated dSYM does not match binary UUIDs: $dsym_name" >&2
    echo "[dsyms] Binary UUIDs:" >&2
    archive_dsym_uuids "$binary_path" >&2 || true
    echo "[dsyms] dSYM UUIDs:" >&2
    archive_dsym_uuids "$dsym_path" >&2 || true
    return 1
  fi

  echo "[dsyms] Verified $dsym_name"
}
