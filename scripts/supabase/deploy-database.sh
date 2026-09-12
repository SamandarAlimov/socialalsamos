#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy Alsamos database schema to a linked Supabase project.
#
# Modes:
#   fresh       - one-time rebuild for a truly empty public schema. Applies the
#                 generated union of legacy alsamos-superapp + socialalsamos
#                 migrations, reconciles migration history, then applies any
#                 newer socialalsamos migrations.
#   incremental - normal long-term deployment using supabase/migrations only.
#
# This script never resets/drops a remote database.

MODE="${1:-incremental}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"

if [[ "$MODE" != "fresh" && "$MODE" != "incremental" ]]; then
  echo "Unsupported database deployment mode: $MODE" >&2
  exit 2
fi

push_incremental() {
  echo "Applying pending socialalsamos migrations..."
  supabase db push \
    --linked \
    --include-all \
    --password "$SUPABASE_DB_PASSWORD"
}

if [[ "$MODE" == "incremental" ]]; then
  push_incremental
  exit 0
fi

MANIFEST="supabase/bootstrap/generated/manifest.json"
BOOTSTRAP_DIR="supabase/bootstrap/generated"
MIGRATIONS_DIR="supabase/migrations"
SYNTHETIC_VERSION="20000101000000"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Fresh bootstrap manifest is missing: $MANIFEST" >&2
  exit 1
fi

shopt -s nullglob
BOOTSTRAP_CHUNKS=("$BOOTSTRAP_DIR"/[0-9][0-9][0-9].sql)
shopt -u nullglob
if (( ${#BOOTSTRAP_CHUNKS[@]} == 0 )); then
  echo "Fresh bootstrap SQL chunks are missing under $BOOTSTRAP_DIR" >&2
  exit 1
fi

# The workflow only calls fresh mode after remote-health.py confirms that the
# public schema is empty. If stale migration-history rows exist from an earlier
# failed attempt, remove only those history markers before the bootstrap. No
# application tables/data are dropped here.
mapfile -t STALE_REMOTE_VERSIONS < <(
  python3 scripts/supabase/remote-health.py migration-versions 2>/dev/null || true
)
if (( ${#STALE_REMOTE_VERSIONS[@]} > 0 )); then
  echo "Clearing ${#STALE_REMOTE_VERSIONS[@]} stale migration-history marker(s) on empty project..."
  supabase migration repair "${STALE_REMOTE_VERSIONS[@]}" \
    --status reverted \
    --linked \
    --password "$SUPABASE_DB_PASSWORD"
fi

BACKUP_DIR="$(mktemp -d)"
RESTORED=0
restore_migrations() {
  if [[ "$RESTORED" == "0" ]]; then
    rm -rf "$MIGRATIONS_DIR"
    if [[ -d "$BACKUP_DIR/migrations" ]]; then
      mv "$BACKUP_DIR/migrations" "$MIGRATIONS_DIR"
    else
      mkdir -p "$MIGRATIONS_DIR"
    fi
    RESTORED=1
  fi
  rm -rf "$BACKUP_DIR"
}
trap restore_migrations EXIT

if [[ -d "$MIGRATIONS_DIR" ]]; then
  mv "$MIGRATIONS_DIR" "$BACKUP_DIR/migrations"
fi
mkdir -p "$MIGRATIONS_DIR"
SYNTHETIC_FILE="$MIGRATIONS_DIR/${SYNTHETIC_VERSION}_alsamos_fresh_bootstrap.sql"

{
  echo "-- GENERATED AT DEPLOY TIME FROM VERSION-CONTROLLED BOOTSTRAP CHUNKS."
  echo "-- One-time fresh project bootstrap; do not use as the ongoing migration stream."
  echo
  for chunk in "${BOOTSTRAP_CHUNKS[@]}"; do
    echo "-- >>> ${chunk}"
    cat "$chunk"
    echo
    echo "-- <<< ${chunk}"
    echo
  done
} > "$SYNTHETIC_FILE"

echo "Applying deterministic fresh Alsamos bootstrap (${#BOOTSTRAP_CHUNKS[@]} chunks)..."
supabase db push \
  --linked \
  --include-all \
  --password "$SUPABASE_DB_PASSWORD"

# Remove only the temporary synthetic migration marker. The schema stays in
# place; migration repair changes history, not database objects.
supabase migration repair "$SYNTHETIC_VERSION" \
  --status reverted \
  --linked \
  --password "$SUPABASE_DB_PASSWORD"

restore_migrations
trap - EXIT

# Mark socialalsamos migrations whose SQL is already represented in the fresh
# bootstrap as applied. This includes exact-content duplicates and deliberately
# excluded test fixtures, so they are never replayed into production.
mapfile -t INCLUDED_WEB_VERSIONS < <(
  python3 - <<'PY'
import json
from pathlib import Path

manifest = json.loads(Path('supabase/bootstrap/generated/manifest.json').read_text(encoding='utf-8'))
migrations_dir = Path('supabase/migrations')
files = set()

for chunk in manifest.get('chunks', []):
    for item in chunk.get('migrations', []):
        if item.startswith('B-web:'):
            files.add(item.split(':', 1)[1])

for item in manifest.get('duplicates', []):
    if item.get('stream') == 'B-web' and item.get('file'):
        files.add(item['file'])

for item in manifest.get('excluded', []):
    if item.get('stream') == 'B-web' and item.get('file'):
        files.add(item['file'])

versions = set()
for filename in files:
    if not (migrations_dir / filename).exists():
        continue
    version = filename.split('_', 1)[0]
    if version.isdigit():
        versions.add(version)

for version in sorted(versions, key=lambda value: (len(value), value)):
    print(version)
PY
)

if (( ${#INCLUDED_WEB_VERSIONS[@]} > 0 )); then
  echo "Reconciling ${#INCLUDED_WEB_VERSIONS[@]} socialalsamos migration-history marker(s)..."
  supabase migration repair "${INCLUDED_WEB_VERSIONS[@]}" \
    --status applied \
    --linked \
    --password "$SUPABASE_DB_PASSWORD"
fi

# Apply migrations newer than the committed bootstrap (including the Auth user
# profile backfill used when a user was created before the schema existed).
push_incremental

echo "Fresh database bootstrap completed without a destructive remote reset."
