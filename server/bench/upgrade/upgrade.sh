#!/usr/bin/env bash
# Upgrade from the last release, the way an owner does it: the release's own
# demo seeder fills a data directory, the release's image serves it (and
# takes a few live visits), stops; then this build starts on the same
# directory. It must start, migrate, keep a copy from before the migration
# that restores (into the release and into this build), report the same
# visitors, pageviews and revenue (moved only by the intended changes listed
# in expected.tsv), and start a second time without doing any
# of it again.
#
# usage: bench/upgrade/upgrade.sh <path to trckabled> [work dir]
#   UPGRADE_FROM=v0.2.0   the release to upgrade from (default: the last tag)
# Needs Docker, Go, git, curl and python3.
set -euo pipefail
BIN=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
WORK=${2:-$(mktemp -d)}
HERE=$(cd "$(dirname "$0")/../.." && pwd)
REPO=$(cd "$HERE/.." && pwd)
# The newest release before this commit: on the release's own commit, the one
# before it (its image may still be building).
last() { git -C "$REPO" describe --tags --abbrev=0 --match 'v[0-9]*' "$@"; }
TAG=${UPGRADE_FROM:-$(last)}
if [ -z "${UPGRADE_FROM:-}" ] && [ "$(git -C "$REPO" rev-parse "$TAG^{commit}")" = "$(git -C "$REPO" rev-parse HEAD)" ]; then
  TAG=$(last "$TAG^")
fi
REL=${TAG#v}
IMAGE=ghcr.io/trckable/trckable:$REL
PORT=${PORT:-18093}; TOK=upgrade_token_0123456789
D=$WORK/data; NAME=trckable-upgrade-check-$$
export TRCKABLE_SECRET=upgrade-secret-0123456789 TRCKABLE_API_TOKEN=$TOK TRCKABLE_GEO=off TRCKABLE_LOG_LEVEL=info
rm -rf "$WORK/src" "$D" "$WORK"/r-*; mkdir -p "$WORK/src" "$D"
say() { printf '  %s\n' "$*"; }
fail() { printf '✗ upgrade from %s: %s\n' "$REL" "$*" >&2; exit 1; }
ms() { python3 -c 'import time;print(int(time.time()*1000))'; }

PID=; CONTAINERS=()
cleanup() {
  [ -n "$PID" ] && kill "$PID" 2>/dev/null || true
  for c in ${CONTAINERS[@]+"${CONTAINERS[@]}"}; do docker rm -f "$c" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

# The release: its image, and its own seeder from its tag.
docker pull -q "$IMAGE" >/dev/null || fail "cannot pull $IMAGE"
git -C "$REPO" archive "$TAG" server | tar -x -C "$WORK/src"
(cd "$WORK/src/server" && go run ./bench/demoseed -data "$D" -days 30 -daily 150 >/dev/null)

# The release serves it. As this user, so this build can open the files next.
release() { # <name> <data dir> [args…]
  local n=$1 dir=$2; shift 2
  CONTAINERS+=("$n")
  docker run -d --name "$n" --user "$(id -u):$(id -g)" -e TRCKABLE_SECRET -e TRCKABLE_API_TOKEN -e TRCKABLE_GEO \
    -p "127.0.0.1:$PORT:8080" -v "$dir:/data" "$IMAGE" "$@" >/dev/null
}
release_stop() {
  docker stop -t 30 "$1" >/dev/null
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$1")" = 0 ] || { docker logs "$1" | tail -20; fail "the release did not stop cleanly"; }
  docker rm "$1" >/dev/null
}
serve() { TRCKABLE_DATA_DIR=$1 TRCKABLE_ADDR=127.0.0.1:$PORT "$BIN" serve >"$2" 2>&1 & PID=$!; }
stop() {
  kill "$PID"; local code=0; wait "$PID" || code=$?; PID=
  [ "$code" = 0 ] || fail "this build exited with $code on stop"
}
# Listening: the first answer to /readyz. Ready: the analytics store is open
# and the writer has caught up.
listening() {
  for _ in $(seq 1 600); do curl -sf -o /dev/null "localhost:$PORT/readyz" && return 0; sleep 0.05; done
  return 1
}
ready() {
  for _ in $(seq 1 240); do
    if curl -sf "localhost:$PORT/readyz" | python3 -c 'import json,sys;d=json.load(sys.stdin);sys.exit(0 if d.get("analytics_ready") and not d.get("wal_lag") else 1)' 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  return 1
}
auth=(-H "Authorization: Bearer $TOK")
site() { curl -sf "${auth[@]}" "localhost:$PORT/api/v1/sites" | python3 -c 'import json,sys;d=json.load(sys.stdin);d=d.get("sites",d);print(d[0]["id"])'; }
# The numbers an owner reads, for one fixed range: read until two reads in a
# row agree, so payments still being applied at start are not a difference.
read -r FROM TO < <(python3 -c 'import datetime as d;t=d.date.today();print(t-d.timedelta(days=29),t)')
numbers() {
  local s prev="" cur
  s=$(site) || fail "no site to report on"
  for _ in $(seq 1 30); do
    cur=$(curl -sf "${auth[@]}" "localhost:$PORT/api/v1/sites/$s/report?from=$FROM&to=$TO" | python3 -c '
import json,sys
d=json.load(sys.stdin)["current"]; k=d["kpis"]; m=d.get("money") or {}
print(json.dumps({"visitors":k["visitors"],"sessions":k["sessions"],"pageviews":k["pageviews"],
  "revenue":m.get("revenue"),"refunds":m.get("refunds"),"payments":m.get("payments"),"customers":m.get("customers")},sort_keys=True))') ||
      fail "no report"
    [ "$cur" = "$prev" ] && { echo "$cur"; return 0; }
    prev=$cur; sleep 1
  done
  fail "the report never settled"
}
q() { python3 -c 'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);r=c.execute(sys.argv[2]).fetchone();print(r[0] if r else "")' "$D/trckable.db" "$1"; }
copies() { python3 -c 'import os,sys;d=sys.argv[1];print(sorted((f,os.stat(os.path.join(d,f)).st_mtime_ns) for f in os.listdir(d)) if os.path.isdir(d) else [])' "$D/backups/before-upgrade"; }

echo "▸ $REL: seeded by its own demo seeder, served by $IMAGE"
release "$NAME" "$D"
listening && ready || { docker logs "$NAME" | tail -20; fail "the release never became ready"; }
S=$(site)
# Revenue in the report: the seeder's payments count once the module is on.
curl -sf -o /dev/null "${auth[@]}" -X PUT -H 'Content-Type: application/json' -d '{"enabled":true}' \
  "localhost:$PORT/api/v1/sites/$S/modules/revenue" || fail "the release would not turn revenue on"
# A few live visits too, through the release's own ingest.
for i in $(seq 1 12); do
  curl -sf -o /dev/null -X POST "localhost:$PORT/api/e" \
    -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/14$i.0 Safari/537.36" \
    -d "{\"s\":\"$S\",\"k\":\"pv\",\"u\":\"https://demo.trckable.com/upgrade/$i\"}" || fail "the release refused a visit"
done
ready || fail "the release did not apply the live visits"
BEFORE=$(numbers)
release_stop "$NAME"
case $BEFORE in *'"revenue": null'*|*'"revenue": 0,'*) fail "no revenue to compare: $BEFORE";; esac
OLD_SQ=$(q 'PRAGMA user_version')
# What this build must report: the release's numbers, moved by exactly the
# intended changes listed for this release in expected.tsv.
WANT=$(python3 - "$HERE/bench/upgrade/expected.tsv" "$REL" "$BEFORE" <<'EOF2'
import json,sys
d=json.loads(sys.argv[3])
for line in open(sys.argv[1]):
    if line.startswith("#") or not line.strip(): continue
    rel,metric,delta=line.rstrip("\n").split("\t")[:3]
    if rel!=sys.argv[2]: continue
    if d.get(metric) is None: sys.exit(f"expected.tsv: no {metric} in the report")
    d[metric]+=int(delta)
print(json.dumps(d,sort_keys=True))
EOF2
) || fail "cannot apply expected.tsv"
if [ "$WANT" = "$BEFORE" ]; then SAME=identical; else SAME="as expected.tsv says (before $BEFORE)"; say "intended changes from $REL: $(grep "^$REL	" "$HERE/bench/upgrade/expected.tsv" | cut -f2-4 | tr '\t\n' ' ;')"; fi
say "release: control schema $OLD_SQ, $BEFORE"

echo "▸ this build ($("$BIN" version)) starts on the release's data"
T0=$(ms); serve "$D" "$WORK/upgrade.log"
listening || { tail -20 "$WORK/upgrade.log"; fail "this build did not start on the release's data"; }
BOOT_UPGRADE=$(( $(ms) - T0 ))
ready || { tail -20 "$WORK/upgrade.log"; fail "this build never became ready"; }
AFTER=$(numbers)
stop
NEW_SQ=$(q 'PRAGMA user_version'); DUCK=$(q "SELECT value FROM meta WHERE key = 'duck_schema'")
[ "$AFTER" = "$WANT" ] || fail "the report changed: before $BEFORE, after $AFTER, expected $WANT"
say "listening after ${BOOT_UPGRADE} ms; report $SAME"

UPGRADED=$(python3 - "$WORK/upgrade.log" <<'EOF'
import json,sys
for line in open(sys.argv[1]):
    try: d=json.loads(line)
    except ValueError: continue
    if d.get("msg")=="upgraded": print(json.dumps(d)); break
EOF
)
if [ "$OLD_SQ" = "$NEW_SQ" ] && [ -z "$UPGRADED" ]; then
  # Nothing to migrate since the release: an upgrade is a restart, and must
  # not have made a copy for nothing.
  [ "$(copies)" = "[]" ] || fail "a copy was made with nothing to migrate: $(copies)"
  say "no migration since $REL: a plain restart, no copy made"
else
  [ -n "$UPGRADED" ] || fail "control schema $OLD_SQ → $NEW_SQ, but the log says nothing about an upgrade"
  FILE=$(python3 - "$UPGRADED" "$OLD_SQ" "$NEW_SQ" "$DUCK" "$REL" <<'EOF'
import json,os,sys
d=json.loads(sys.argv[1]); old,new,duck,rel=int(sys.argv[2]),int(sys.argv[3]),sys.argv[4],sys.argv[5]
assert d["sqlite_from"]==old, f"migrated from {d['sqlite_from']}, the release left {old}"
assert d["sqlite_to"]==new, f"log says {d['sqlite_to']}, the database is at {new}"
assert str(d["duck_to"])==duck, f"analytics at {d['duck_to']}, recorded {duck}"
assert d["from"]==rel, f"the copy is named for {d['from']}, the release is {rel}"
b=d["backup"]; assert b and os.path.isfile(b), f"no copy at {b!r}"
assert os.path.basename(b).startswith(f"trckable-{rel}-"), b
print(b)
EOF
  ) || fail "the upgrade did not do what it said"
  say "migrated: control $OLD_SQ → $NEW_SQ, analytics at $DUCK; copy kept: $(basename "$FILE") ($(wc -c <"$FILE" | tr -d ' ') bytes)"

  # The way back: the copy restores into the release it came from…
  R=$WORK/r-release; mkdir -p "$R"
  docker run --rm --user "$(id -u):$(id -g)" -e TRCKABLE_SECRET -v "$(dirname "$FILE"):/b:ro" -v "$R:/r" \
    "$IMAGE" restore "/b/$(basename "$FILE")" /r >/dev/null || fail "the release could not restore the copy"
  release "$NAME-back" "$R"
  listening && ready || { docker logs "$NAME-back" | tail -20; fail "the release did not start on its restored copy"; }
  BACK=$(numbers); release_stop "$NAME-back"
  [ "$BACK" = "$BEFORE" ] || fail "the copy, restored into $REL, reports $BACK, not $BEFORE"
  say "the copy restores into $REL: report identical"
  # …and into this build.
  R=$WORK/r-build
  "$BIN" restore "$FILE" "$R" >/dev/null || fail "this build could not restore the copy"
  serve "$R" "$WORK/restored.log"; listening && ready || fail "this build did not start on the restored copy"
  BACK=$(numbers); stop
  [ "$BACK" = "$WANT" ] || fail "the copy, restored into this build, reports $BACK, not $WANT"
  say "the copy restores into this build: report $SAME"
fi

echo "▸ a second start is a normal one"
KEPT=$(copies)
T0=$(ms); serve "$D" "$WORK/second.log"
listening || fail "the second start failed"
BOOT_NORMAL=$(( $(ms) - T0 ))
ready || fail "the second start never became ready"
AGAIN=$(numbers); stop
[ "$AGAIN" = "$WANT" ] || fail "the second start reports $AGAIN, not $WANT"
! grep -q '"msg":"\(upgraded\|upgrading\|copy kept\)' "$WORK/second.log" || fail "the second start upgraded again: $(grep upgrad "$WORK/second.log")"
[ "$(copies)" = "$KEPT" ] || fail "the second start touched the kept copy"
[ "$(q 'PRAGMA user_version')" = "$NEW_SQ" ] || fail "the second start changed the schema"
say "listening after ${BOOT_NORMAL} ms; nothing migrated, nothing copied, report $SAME"

echo "upgrade from $REL $SAME: $WANT; listening after ${BOOT_UPGRADE} ms with the upgrade, ${BOOT_NORMAL} ms without"
