#!/usr/bin/env bash
# Ship: run the checks CI runs, then push main. Two stay in CI only: the
# Docker image (size, boot, memory) and govulncheck, which need Docker and the
# network. Nothing is deployed from here: self-hosters build it themselves.
# Nothing is pushed unless everything passes.
#
#   scripts/ship.sh           the full gate (about 3 minutes), then push
#   scripts/ship.sh --check   the gate only, no push (any branch: use it on a pull request)
#   scripts/ship.sh --quick   Go, tracker and dashboard tests only (the pre-push hook)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
MODE=${1:-}
step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*"; exit 1; }

[ -n "$MODE" ] || [ "$(git branch --show-current)" = main ] || fail "ship from main"

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

step "push main"
git push --no-verify origin main # the full gate above already ran
printf '\n\033[32m✓ pushed.\033[0m\n'
