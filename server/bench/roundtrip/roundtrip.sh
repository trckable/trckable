#!/usr/bin/env bash
# Backup → restore round trip against the real binary, the way an owner does it:
# seed an instance, serve it, run `trckabled backup` while it is running, stop
# it, restore into an empty directory, serve that, and compare the reports.
# They must be byte-for-byte identical.
#
# usage: bench/roundtrip/roundtrip.sh <path to trckabled> [work dir]
set -euo pipefail
BIN=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
WORK=${2:-$(mktemp -d)}
HERE=$(cd "$(dirname "$0")/../.." && pwd)
A=$WORK/before; N=$WORK/after; PORT=${PORT:-18091}; TOK=roundtrip_token_0123456789
rm -rf "$A" "$N"; mkdir -p "$A" "$N"
export TRCKABLE_SECRET=roundtrip-secret-0123456789 TRCKABLE_API_TOKEN=$TOK TRCKABLE_GEO=off TRCKABLE_LOG_LEVEL=warn
(cd "$HERE" && go run ./bench/demoseed -data "$A" -days 30 -daily 150 >/dev/null)

PID=
cleanup() { [ -n "$PID" ] && kill "$PID" 2>/dev/null || true; }
trap cleanup EXIT
serve() { TRCKABLE_DATA_DIR=$1 TRCKABLE_ADDR=127.0.0.1:$PORT "$BIN" serve >"$1.log" 2>&1 & PID=$!; }
stop() { kill "$PID"; wait "$PID" 2>/dev/null || true; PID=; }
# Ready means the analytics store is open and the writer has caught up.
ready() {
  for _ in $(seq 1 240); do
    if curl -sf "localhost:$PORT/readyz" | python3 -c 'import json,sys;d=json.load(sys.stdin);sys.exit(0 if d.get("analytics_ready") and not d.get("wal_lag") else 1)' 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  echo "server never became ready"; cat "$1.log"; return 1
}
report() {
  local site from to
  site=$(curl -sf -H "Authorization: Bearer $TOK" "localhost:$PORT/api/v1/sites" | python3 -c 'import json,sys;d=json.load(sys.stdin);d=d.get("sites",d);print(d[0]["id"])')
  read -r from to < <(python3 -c 'import datetime as d;t=d.date.today();print(t-d.timedelta(days=29),t)')
  curl -sf -H "Authorization: Bearer $TOK" "localhost:$PORT/api/v1/sites/$site/report?from=$from&to=$to" |
    python3 -c '
import json,sys
d=json.load(sys.stdin)
[d.pop(k,None) for k in ("generated_at","online","cached","took_ms")]
# Averages are summed in parallel, in whatever order the threads finish, so
# their last digit can move between two runs over the same data: compare them
# to 9 significant digits. Counts are integers and stay exact.
def r(v):
    if isinstance(v,float): return float(f"{v:.9g}")
    if isinstance(v,dict): return {k:r(x) for k,x in v.items()}
    if isinstance(v,list): return [r(x) for x in v]
    return v
print(json.dumps(r(d),sort_keys=True))'
}
ledger() { python3 -c 'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);print([c.execute("select count(*) from "+t).fetchone()[0] for t in ("sites","pay_payments","pay_inbox","pay_connections")])' "$1/trckable.db"; }

serve "$A"; ready "$A"; report >"$WORK/before.json"
TRCKABLE_DATA_DIR=$A "$BIN" backup >/dev/null
stop
FILE=$(ls -t "$A"/backups/*.tkb | head -1)
TRCKABLE_DATA_DIR=$A "$BIN" restore "$FILE" "$N"
serve "$N"; ready "$N"; report >"$WORK/after.json"; stop

cmp "$WORK/before.json" "$WORK/after.json"
[ "$(ledger "$A")" = "$(ledger "$N")" ] || { echo "ledger differs: $(ledger "$A") vs $(ledger "$N")"; exit 1; }
echo "round trip identical: report $(wc -c <"$WORK/after.json") bytes, ledger $(ledger "$N")"
