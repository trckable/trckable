# Contributing

Thank you for helping. Bug reports, fixes and small improvements are all
welcome; for anything larger, open an issue first so we can agree on the
approach before you spend time on it.

## Build and run

You need Go 1.27, Node 22 and pnpm 10.

```bash
pnpm install
git config core.hooksPath .githooks    # runs the quick checks before a push

cd dashboard && pnpm build && cd ..     # the dashboard is embedded in the server
cd tracker && pnpm build && cd ..       # so is the tracker
cd server && go run ./cmd/trckabled serve
```

The server prints a one-time setup link on first start. `go run
./bench/demoseed` fills an instance with realistic demo traffic.

## How changes land

Five stages, one command each. The maintainer's full runbook (the site, the
docs, what to do when a step fails) is `ops/SHIPPING.md` in the private
repository; this is the part that happens here.

| Stage | Command | What it does |
| --- | --- | --- |
| 1. Work | `pnpm work <topic>` | A fresh branch from the latest `main`. One topic per branch, never a branch on top of an unmerged one |
| 2. Land | `pnpm ship` | The full gate (below), then push and open the pull request (or update it). Once every check is green it is squash-merged, and the branch is deleted |
| 3. Prepare a release | `pnpm release X.Y.Z` | Every version bumped, the Unreleased notes dated, CI's figures and the screenshots whose screen changed brought up to date, the gate, and the release pull request |
| 4. Publish | `pnpm release tag X.Y.Z` | After that pull request is merged: tags `main`, waits for the release workflow, then checks the GitHub release, npm and the Docker image |
| 5. The site | `web:ship` (private repo) | trckable.com and the docs, checked live |

`pnpm status` shows where everything stands: open pull requests and their
checks, what is waiting to be released, and the version on GitHub, npm, the
image and trckable.com. `pnpm tidy` deletes local branches whose pull request
is merged (`pnpm work` runs it too).

The rules on `main`:

- Six checks are required and a ruleset without a bypass enforces them, so
  nobody merges with a failing check, maintainers included: server, tracker
  and npm package, dashboard, browsers, image, and the CLA.
- A pull request from anyone else needs the maintainer's review (CODEOWNERS).
  The maintainer's own are merged with admin rights once every check is green.
- Every change people will notice carries its own line in CHANGELOG.md under
  "Unreleased", in the same pull request (`scripts/changelog-check.mjs`, run by
  `pnpm ship` and by CI). A change nobody notices is marked with the
  `no-changelog` label, or `[no-changelog]` in a commit message.

## Before you open a pull request

```bash
pnpm check      # what CI runs, on any branch: Go, tracker, dashboard, npm package,
                # a backup round trip, the crash tests and the browser suites
                # (CI alone also checks the Docker image and runs govulncheck)
```

- Keep the tracker inside its size budget: the build fails if it grows past it.
- The dashboard and tracker builds are committed (`server/internal/web/`), so
  commit them together with the source change.
- Every visible string is plain English and short. Every feature works in the
  self-hosted edition: nothing is held back for a hosted one.
- New behaviour comes with a test, and a line in CHANGELOG.md under
  "Unreleased".

## Licensing of contributions

The server and dashboard are AGPL-3.0; the tracker and the npm package are
MIT. On your first pull request a bot asks you to sign the short contributor
licence agreement, [CLA.md](CLA.md), by commenting once. It lets the project
keep offering an optional hosted version, and promises that every accepted
contribution stays available under its open-source licence.
