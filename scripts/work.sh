#!/usr/bin/env bash
# Stage 1 of shipping (ops: SHIPPING.md): start a piece of work.
#
#   pnpm work <topic>     a fresh branch named <topic>, from the latest main
#
# One topic per branch, and never a branch on top of another: a branch built
# on an unmerged one falls behind main the moment the first is merged, and
# each merge then means a rebase and a second round of checks. So this refuses
# to start while the current branch holds work that is not on main yet.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*"; exit 1; }

TOPIC=${1:-}
[[ $TOPIC =~ ^[a-z0-9][a-z0-9-]*$ ]] || fail "usage: pnpm work <topic>, a short name in lower case: share-cards, fix-backup"
[ -z "$(git status --porcelain)" ] || { git status --short; fail "uncommitted changes: commit them on their own branch first"; }
git show-ref --quiet "refs/heads/$TOPIC" && fail "a branch $TOPIC exists already: git switch $TOPIC"

git fetch -q --prune origin
CUR=$(git branch --show-current)
if [ "$CUR" != main ] && [ -n "$(git log --oneline origin/main..HEAD)" ]; then
  # A squash merge leaves the branch's own commits off main, so ask GitHub.
  STATE=$(gh pr view "$CUR" --json state -q .state 2>/dev/null || echo "no pull request")
  [ "$STATE" = MERGED ] || fail "$CUR has work that is not on main ($STATE): land it first (pnpm ship, then merge), or git switch main"
fi

git checkout -q main
git pull -q --ff-only origin main
"$ROOT/scripts/tidy.sh"
git checkout -q -b "$TOPIC"
printf '\033[32m✓ on %s, from main at %s\033[0m\n' "$TOPIC" "$(git log -1 --format=%h)"
echo "  Each change: its code, its CHANGELOG line under Unreleased, its docs. Then: pnpm ship"
