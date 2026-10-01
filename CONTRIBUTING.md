# Contributing

Thank you for helping. Bug reports, fixes and small improvements are all
welcome; for anything larger, open an issue first so we can agree on the
approach before you spend time on it.

## Build and run

You need Go 1.27, Node 22 and pnpm 12.

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

Four stages, one command each.

| Stage | Command | What it does |
| --- | --- | --- |
| 1. Work | `pnpm work <topic>` | A fresh branch from the latest `main`. One topic per branch, never a branch on top of an unmerged one |
| 2. Land | `pnpm ship` | The full gate (below), then push and open the pull request (or update it). Once every check is green it is squash-merged, and the branch is deleted |
| 3. Prepare a release | `pnpm release X.Y.Z` | Every version bumped, the Unreleased notes dated, CI's figures and the screenshots whose inputs changed brought up to date, and the release pull request; the checks on that pull request are the gate |
| 3–4 in one | `pnpm release X.Y.Z --ship` | Prepare, wait for every check, merge, tag, wait for the release workflow, check GitHub, npm and the image; the time of each step at the end |
| 4. Publish | `pnpm release tag X.Y.Z` | After that pull request is merged: tags `main`, waits for the release workflow, then checks the GitHub release, npm and the Docker image |

`pnpm status` shows where everything stands: open pull requests and their
checks, what is waiting to be released, and the version on GitHub, npm, the
image and trckable.com. `pnpm tidy` deletes local branches whose pull request
is merged (`pnpm work` runs it too).

The rules on `main`:

- Six checks are required on `main`: server, tracker and npm package,
  dashboard, browsers, image, and the CLA. The changelog line is checked too.
- A pull request from anyone else needs the maintainer's review (CODEOWNERS).
  The maintainer's own are merged with admin rights once every check is green.
- Every change people will notice carries its own line in CHANGELOG.md under
  "Unreleased", in the same pull request (`scripts/changelog-check.mjs`, run by
  `pnpm ship` and by CI). A change nobody notices is marked with the
  `no-changelog` label, or `[no-changelog]` in a commit message.

## Before you open a pull request

```bash
pnpm check      # what CI runs, on any branch: Go, tracker, dashboard, npm package,
                # the linters, a backup round trip, the crash tests and the browser
                # suites (CI alone also checks the Docker image and runs
                # govulncheck and pnpm audit)
```

- Keep the tracker inside its size budget: the build fails if it grows past it.
- The dashboard and tracker builds are committed (`server/internal/web/`), so
  commit them together with the source change.
- Every visible string is plain English and short. Every feature works when
  you host trckable yourself: nothing is held back.
- New behaviour comes with a test, and a line in CHANGELOG.md under
  "Unreleased".

## Code standards

Machines check these, in `pnpm check` and in CI, so a review can talk about
the change rather than the style.

- **Go**: `gofmt`, `go vet`, and `golangci-lint` with its standard linters plus
  `gosec`, `errcheck`, `bodyclose` and `noctx` (`server/.golangci.yml`). Every
  error is handled or deliberately discarded with `_ =`; a gosec finding that
  is wrong gets `//nolint:gosec // why` on its line, with the reason.
  `govulncheck` runs in CI.
- **Dashboard**: ESLint (`dashboard/eslint.config.js`): typescript-eslint
  strict with types, the React hooks rules, `jsx-a11y`, and no nested ternaries.
  Where a rule is switched off for one line, the comment says why.
- **Only down, never up**: `dashboard/baselines.json` holds two counts that may
  shrink but not grow: literal text in JSX (it belongs in message files, which
  the dashboard does not have yet) and components over 250 lines, each at its
  current length. A new component stays under 250 lines. After shrinking one,
  record it with `--lower` (below) and commit the file.
- **Dependencies**: `pnpm audit` (production, high and above) runs in CI.

Run them on their own:

```bash
cd server && go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0 run ./...
cd dashboard && pnpm lint           # ESLint, literal text and component sizes
node dashboard/scripts/lint.mjs --lower             # record a lower literal count
node dashboard/scripts/component-size.mjs --lower   # record shorter components
```

The golangci-lint version is pinned in `scripts/ship.sh` and `.github/workflows/ci.yml`;
`go run` builds it once into Go's cache, nothing is installed.

## Licensing of contributions

The server and dashboard are AGPL-3.0; the tracker and the npm package are
MIT. On your first pull request a bot asks you to sign the short contributor
licence agreement, [CLA.md](CLA.md), by commenting once. It lets the project
offer the software in other forms, and promises that every accepted
contribution stays available under its open-source licence.
