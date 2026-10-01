#!/usr/bin/env bash
# A volume an older image filled as root, taken over by the unprivileged image:
# the last release (as root) takes an event on a named volume; the new image
# refuses that volume and prints the chown to run; after the chown the new
# image starts on it and holds the same site and the same events.
#
# usage: bench/rootvolume/rootvolume.sh <new image> [old image]
#   old image defaults to ghcr.io/trckable/trckable:latest
# Needs Docker, curl and python3.
set -euo pipefail
NEW=${1:?usage: rootvolume.sh <new image> [old image]}
OLD=${2:-ghcr.io/trckable/trckable:latest}
PORT=${PORT:-18095}
V=tkb-rootvol-$$; N=tkb-rootvol-run-$$
say() { printf '  %s\n' "$*"; }
fail() { printf '✗ root-owned volume: %s\n' "$*" >&2; docker logs "$N" 2>&1 | tail -20 >&2 || true; exit 1; }
cleanup() { docker rm -f "$N" >/dev/null 2>&1 || true; docker volume rm -f "$V" >/dev/null 2>&1 || true; }
trap cleanup EXIT

ready() { for _ in $(seq 1 100); do curl -sf "127.0.0.1:$PORT/readyz" >/dev/null && return 0; sleep 0.2; done; fail "$1 did not become ready"; }
committed() { curl -sf "127.0.0.1:$PORT/readyz" | python3 -c 'import json,sys; print(json.load(sys.stdin)["wal_committed"])'; }
stop() { docker stop -t 30 "$N" >/dev/null; [ "$(docker inspect -f '{{.State.ExitCode}}' "$N")" = 0 ] || fail "$1 did not stop cleanly"; docker rm "$N" >/dev/null; }

docker pull -q "$OLD" >/dev/null || fail "cannot pull $OLD"
docker volume create "$V" >/dev/null

# The old image, as root, the way it always ran.
docker run -d --name "$N" --user 0 -e TRCKABLE_GEO=off -p "127.0.0.1:$PORT:8080" -v "$V":/data "$OLD" >/dev/null
ready "the old image"
site=$(docker exec "$N" trckabled site add rootvol.example)
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "127.0.0.1:$PORT/api/e" \
  -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' \
  -d "{\"s\":\"$site\",\"k\":\"pv\",\"u\":\"https://rootvol.example/\"}")
[ "$code" = 202 ] || fail "the old image answered $code to an event"
before=$(committed)
[ "$before" -ge 1 ] || fail "the old image holds no event ($before)"
stop "the old image"
say "the old image (root) holds site $site and $before event(s)"

# The new image refuses the volume, and says what to run.
if out=$(docker run --rm -v "$V":/data "$NEW" site list 2>&1); then fail "the new image accepted a root-owned volume"; fi
echo "$out" | grep -q 'chown -R 65532:65532 /data' || { echo "$out" >&2; fail "the refusal does not say what to run"; }
say "the new image refused it, naming: chown -R 65532:65532 /data"

# The documented fix, then the new image on the same data.
docker run --rm -v "$V":/data busybox chown -R 65532:65532 /data
docker run -d --name "$N" -e TRCKABLE_GEO=off -p "127.0.0.1:$PORT:8080" -v "$V":/data "$NEW" >/dev/null
ready "the new image"
docker exec "$N" trckabled site list | grep -q "$site" || fail "site $site is gone"
after=$(committed)
[ "$after" = "$before" ] || fail "events: $before before, $after after"
stop "the new image"
say "after the chown the new image holds the same site and the same $after event(s)"
