#!/usr/bin/env bash
# Run a probe with a dev server that is guaranteed to be alive for it.
#
# Why this exists: a backgrounded dev server does not reliably survive between
# separate shell invocations in this environment, so a probe launched in a later
# call can hit ERR_CONNECTION_REFUSED — or worse, connect to an ORPHANED server
# from the sibling checkout on 5173 and silently measure the wrong branch. Owning
# the server's whole lifetime inside one invocation removes both failure modes.
#
# It also uses `vite.probe.config.ts`, which gives the probe server its own
# `cacheDir`. `node_modules` is symlinked to the sibling checkout, so the two
# share Vite's optimizer cache; when one re-optimizes, the other answers
# `504 (Outdated Optimize Dep)` for the lazy EffectsImpl chunk, R3F's error
# boundary replaces the scene, and every screenshot silently captures the error
# card. (A card is perfectly stable, so frame diffs then read 0.00 for every
# setting — see lib.mjs:assertSceneAlive.)
#
# Usage: scripts/dev-probes/with-server.sh <probe.mjs> [env assignments...]
#   scripts/dev-probes/with-server.sh frame-time.mjs DSF=2 SECONDS=10
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${PROBE_PORT:-5199}"
PROBE="$1"; shift

npx vite --config vite.probe.config.ts --port "$PORT" --strictPort > /tmp/ssg-probe-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://localhost:$PORT/"; then break; fi
  sleep 1
done
if ! curl -fsS -o /dev/null "http://localhost:$PORT/"; then
  echo "probe server failed to start; log:" >&2
  tail -20 /tmp/ssg-probe-server.log >&2
  exit 1
fi

# Warn if the machine is busy — a loaded machine makes frame-COST numbers
# meaningless, and the sibling checkout's dev server / test runs are a common
# cause. Visual diffs are unaffected.
LOAD=$(sysctl -n vm.loadavg | awk '{print $2}')
echo "probe server up on :$PORT (load average ${LOAD})"
awk -v l="$LOAD" 'BEGIN { if (l+0 > 3.0) print "  WARNING: load " l " is high — treat any millisecond number from this run as unreliable." }'

env "$@" SSG_URL="http://localhost:$PORT/" node "scripts/dev-probes/$PROBE"
