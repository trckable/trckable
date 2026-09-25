#!/usr/bin/env bash
# Deletes the local branches whose pull request is merged. GitHub deletes the
# branch there when it merges (the repository setting), so after this a
# merged branch is gone everywhere. main and cla-signatures always stay.
#
#   pnpm tidy
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q --prune origin
CUR=$(git branch --show-current)
# name and the last commit of every merged pull request
MERGED=$(gh pr list --state merged --limit 200 --json headRefName,headRefOid -q '.[] | .headRefName + " " + .headRefOid')
for b in $(git for-each-ref --format='%(refname:short)' refs/heads); do
  case "$b" in main | cla-signatures | "$CUR") continue ;; esac
  # Only when everything on the branch went into that pull request: a name
  # used again after its merge holds new work, and stays.
  for oid in $(awk -v b="$b" '$1 == b { print $2 }' <<< "$MERGED"); do
    if git merge-base --is-ancestor "$b" "$oid" 2>/dev/null; then
      git branch -q -D "$b" && echo "  deleted $b (merged)"
      break
    fi
  done
  git show-ref --quiet "refs/heads/$b" && grep -q "^$b " <<< "$MERGED" && echo "  kept $b: it has commits after its merged pull request"
done
true
