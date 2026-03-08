#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <profile>"
  exit 1
fi

PROFILE="$1"
MANIFEST="manifest_${PROFILE}.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required to patch ${MANIFEST}."
  exit 1
fi

if [ ! -f "$MANIFEST" ]; then
  echo "Error: ${MANIFEST} not found. Run 'sozo -P ${PROFILE} build' first."
  exit 1
fi

TMP_FILE="$(mktemp)"

jq '
    .contracts |= map(
      if .tag == "dark_waters-Actions" then
        .init_calldata = []
      else
        .
      end
    )
  ' \
  "$MANIFEST" > "$TMP_FILE"

mv "$TMP_FILE" "$MANIFEST"
echo "Patched ${MANIFEST} with Actions dojo_init calldata."
