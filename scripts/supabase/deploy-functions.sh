#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"

if [[ ! -d supabase/functions ]]; then
  echo "supabase/functions directory is missing" >&2
  exit 1
fi

mapfile -t FUNCTION_DIRS < <(
  find supabase/functions \
    -mindepth 1 -maxdepth 1 -type d \
    ! -name '_*' \
    -exec test -f '{}/index.ts' ';' \
    -print | sort
)

if (( ${#FUNCTION_DIRS[@]} == 0 )); then
  echo "No deployable Edge Functions were found." >&2
  exit 1
fi

function_verify_jwt() {
  local function_name="$1"
  python3 - "$function_name" <<'PY'
import sys
import tomllib
from pathlib import Path

name = sys.argv[1]
config = tomllib.loads(Path('supabase/config.toml').read_text(encoding='utf-8'))
entry = config.get('functions', {}).get(name, {})
value = entry.get('verify_jwt', True)
print('true' if bool(value) else 'false')
PY
}

echo "Deploying ${#FUNCTION_DIRS[@]} Supabase Edge Functions..."
DEPLOYED=0
for dir in "${FUNCTION_DIRS[@]}"; do
  name="$(basename "$dir")"
  verify_jwt="$(function_verify_jwt "$name")"

  args=(functions deploy "$name" --project-ref "$SUPABASE_PROJECT_REF")
  if [[ "$verify_jwt" == "false" ]]; then
    args+=(--no-verify-jwt)
  fi

  echo "::group::Deploy Edge Function: $name (verify_jwt=$verify_jwt)"
  supabase "${args[@]}"
  echo "::endgroup::"
  DEPLOYED=$((DEPLOYED + 1))
done

echo "Successfully deployed $DEPLOYED Edge Functions."
