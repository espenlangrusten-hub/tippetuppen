#!/usr/bin/env bash
# Local stand-in for production: serves the PGlite database over the Postgres wire
# protocol, runs the Edge Function under Deno against it, and serves the static
# export. Lets the whole GitHub Pages + Supabase setup be exercised offline.
set -euo pipefail
cd "$(dirname "$0")/.."
LOG_DIR="${LOG_DIR:-.data/dev}"
: "${ADMIN_KEY:?Set ADMIN_KEY to a local value with at least 16 characters}"
: "${ANALYTICS_SALT:?Set ANALYTICS_SALT to a local value}"
mkdir -p "$LOG_DIR"

node --import tsx scripts/pg-socket-server.ts > "$LOG_DIR/pg.log" 2>&1 &
until grep -q PGLITE_SOCKET_READY "$LOG_DIR/pg.log" 2>/dev/null; do sleep 1; done

SUPABASE_DB_URL="postgres://postgres@127.0.0.1:${PG_PORT:-5433}/postgres" \
ADMIN_KEY="$ADMIN_KEY" \
ANALYTICS_SALT="$ANALYTICS_SALT" \
  npx deno run --node-modules-dir=manual --allow-net --allow-env --allow-read \
  --config supabase/functions/deno.json supabase/functions/api/index.ts > "$LOG_DIR/fn.log" 2>&1 &
until curl -sf -o /dev/null "http://localhost:8000/api/today?game=mangler-xi"; do sleep 1; done
echo "DEV_STACK_READY api=http://localhost:8000/api"
