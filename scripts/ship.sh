#!/usr/bin/env bash
# Ship: run the checks CI runs, then push this branch for a pull request.
# main takes changes only through pull requests whose checks passed (a
# GitHub ruleset nobody can bypass), so nothing here pushes main. Two stay in CI only: the
# Docker image (size, boot, memory) and govulncheck, which need Docker and the
# network. Nothing is deployed from here: self-hosters build it themselves.
# Nothing is pushed unless everything passes.
#
#   scripts/ship.sh           the full gate (about 3 minutes), then push this branch
#   scripts/ship.sh --check   the gate only, no push (any branch: use it on a pull request)
#   scripts/ship.sh --quick   Go, tracker and dashboard tests only (the pre-push hook)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
MODE=${1:-}
step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*"; exit 1; }

BRANCH=$(git branch --show-current)
[ -n "$MODE" ] || [ "$BRANCH" != main ] || fail "main takes changes through pull requests: ship from a branch"

step "one version everywhere"
V=$(tr -d '[:space:]' < VERSION)
for f in tracker/package.json packages/trckable/package.json; do
  grep -q "\"version\": \"$V\"" "$f" || fail "$f is not version $V (the VERSION file)"
done
grep -q "Version = \"$V\"" server/internal/server/server.go || fail "server.Version is not $V (the VERSION file)"
grep -q "^## $V" CHANGELOG.md || fail "CHANGELOG.md has no section for $V"
grep -q "badge/version-$V-" README.md || fail "the README's version badge is not $V"

step "server: gofmt, vet, tests"
( cd server
  [ -z "$(gofmt -l .)" ] || { gofmt -l .; fail "gofmt: run gofmt -w on the files above"; }
  go vet ./...
  go test ./... -short -count=1 $([ "$MODE" = --quick ] || echo -race) )

step "tracker: build (size budgets) and tests"
( cd tracker && pnpm -s build && pnpm -s test )

step "dashboard: tests and build"
( cd dashboard && pnpm -s test && pnpm -s build )

if [ "$MODE" != --quick ]; then
  step "npm package: build and tests"
  ( cd packages/trckable && pnpm -s build && pnpm -s test )

  step "server binary, then a backup → restore round trip"
  ( cd server && go build -o bin/trckabled ./cmd/trckabled )
  server/bench/roundtrip/roundtrip.sh server/bin/trckabled | tail -1

  step "crash tests: kill -9 and a graceful restart mid-load, exactly once"
  ( cd server && go run ./bench/crashtest -bin ./bin/trckabled -n 20000 -signal kill | tail -1 \
      && go run ./bench/crashtest -bin ./bin/trckabled -n 20000 -signal term | tail -1 )

  step "browser suites (Chromium, Firefox, WebKit)"
  ( cd e2e && npx playwright test --reporter=line )

  # The same accessibility pass as CI, against a server with demo data. Left
  # out, it skips itself, and a failure would first show up on the pull
  # request; it did, five pushes running.
  step "WCAG 2.1 AA on the main screens, both themes (axe-core, demo data)"
  ( d=$(mktemp -d)
    trap 'kill $pid 2>/dev/null; rm -rf "$d"' EXIT
    (cd server && go run ./bench/demoseed -data "$d" -days 30 -daily 150 > /dev/null)
    echo 'correct horse battery' | TRCKABLE_DATA_DIR="$d" server/bin/trckabled admin add-user me@site.com --role owner > /dev/null
    TRCKABLE_DATA_DIR="$d" TRCKABLE_ADDR=127.0.0.1:8799 server/bin/trckabled serve > "$d/log" 2>&1 &
    pid=$!
    for i in $(seq 1 50); do curl -sf 127.0.0.1:8799/readyz > /dev/null && break; sleep 0.3; done
    cd e2e && TRCKABLE_A11Y_URL=http://127.0.0.1:8799 npx playwright test a11y --reporter=line )
fi

# The dashboard and the tracker are embedded in the server from committed
# build output: a build that changed them must be committed first.
step "build output committed"
if ! git diff --quiet -- server/internal/web; then
  git status --short -- server/internal/web
  fail "the builds above changed committed files: commit them, then ship again"
fi
[ -z "$(git status --porcelain)" ] || { git status --short; fail "uncommitted changes: commit or stash them first"; }

[ "$MODE" = --quick ] && { step "quick checks passed"; exit 0; }
[ "$MODE" = --check ] && { step "all checks passed (not pushed)"; exit 0; }

step "push $BRANCH"
git push --no-verify -u origin "$BRANCH" # the full gate above already ran
printf '\n\033[32m✓ pushed %s: open or update its pull request.\033[0m\n' "$BRANCH"
