#!/usr/bin/env bash
#
# Local Trueyy SDK test runner. The @trueyy/node + @trueyy/web-core suites
# spawn a REAL Cortex server (cortex_test DB), so this script:
#   - brings up Postgres + Redis (via Cortex's docker compose) if needed
#   - prepares the cortex_test schema
#   - runs all 3 packages (@trueyy/node, @trueyy/web-core, @trueyy/web)
#   - cleans up: drops cortex_test, kills any spawned Cortex, and stops ONLY
#     the containers this run started.
#
# Usage:  ./localtest.sh           # with coverage (default)
#         ./localtest.sh --plain   # without coverage (faster)
#
set -uo pipefail
cd "$(dirname "$0")"
SDK_DIR="$(pwd)"
# Cortex is booted from here. Override with CORTEX_DIR=/path/to/Cortex.
CORTEX_DIR="${CORTEX_DIR:-$(cd ../Cortex 2>/dev/null && pwd || true)}"
if [ -z "${CORTEX_DIR:-}" ] || [ ! -f "$CORTEX_DIR/src/index.ts" ]; then
  echo "✗ Cortex not found (looked for ../Cortex). These tests boot the real"
  echo "  Cortex backend — check it out as a sibling of trueyy-sdk, or set:"
  echo "    CORTEX_DIR=/abs/path/to/Cortex ./localtest.sh"
  exit 1
fi
export CORTEX_DIR
TSX="$SDK_DIR/node_modules/.bin/tsx"
PG=cortex-postgres
RD=cortex-redis
STARTED=()

COV="--experimental-test-coverage --test-coverage-include=src/** --test-coverage-exclude=src/types.ts"
[ "${1:-}" = "--plain" ] && COV=""

is_running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }

cleanup() {
  echo ""
  echo "──────── cleanup ────────"
  pkill -f "tsx src/index.ts" >/dev/null 2>&1 && echo "  ✓ killed spawned Cortex server(s)"
  if is_running "$PG"; then
    docker exec "$PG" psql -U postgres -d postgres \
      -c "DROP DATABASE IF EXISTS cortex_test WITH (FORCE);" >/dev/null 2>&1 \
      && echo "  ✓ dropped cortex_test"
  fi
  for c in "${STARTED[@]:-}"; do
    [ -n "${c:-}" ] && docker stop "$c" >/dev/null 2>&1 && echo "  ✓ stopped $c (started by this run)"
  done
  echo "  done."
}
trap cleanup EXIT INT TERM

echo "──────── bring up Postgres + Redis ────────"
for pair in "postgres:$PG" "redis:$RD"; do
  svc="${pair%%:*}"; name="${pair##*:}"
  if is_running "$name"; then
    echo "  • $name already running"
  else
    echo "  • starting $svc ..."
    ( cd "$CORTEX_DIR" && docker compose up -d "$svc" >/dev/null 2>&1 ) && STARTED+=("$name")
  fi
done
for _ in $(seq 1 30); do
  docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && { echo "  ✓ Postgres ready"; break; }
  sleep 1
done

echo "──────── prepare cortex_test schema ────────"
( cd "$CORTEX_DIR" && npm run test:e2e:setup ) || { echo "cortex_test setup failed"; exit 1; }

FAIL=0
run() { echo ""; echo "──────── $1 ────────"; shift; ( "$@" ) || FAIL=1; }

run "@trueyy/node" \
  bash -c "cd '$SDK_DIR/packages/node' && '$TSX' --test --test-concurrency=1 --test-force-exit $COV tests/*.test.ts"

run "@trueyy/web-core" \
  bash -c "cd '$SDK_DIR/packages/web-core' && '$TSX' --test --test-concurrency=1 --test-force-exit $COV tests/*.test.ts"

run "@trueyy/web (React)" \
  bash -c "cd '$SDK_DIR/packages/web-react' && '$TSX' --tsconfig tsconfig.json --import ./tests/_support/setup.ts --test --test-force-exit $COV tests/*.test.tsx"

echo ""
echo "──────── result: $([ $FAIL -eq 0 ] && echo 'ALL PASS ✓' || echo 'FAILURES ✗') ────────"
exit $FAIL
