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

1. Fork the repository and make a branch for your change.
2. Run `pnpm check` (below) until it passes.
3. Open a pull request against `main`. CI runs the same checks, plus the
   Docker image and govulncheck; all six must pass (the sixth is the CLA).
   Nobody can merge with a failing check, maintainers included: a ruleset on
   `main` requires them and has no bypass.
4. The maintainer reviews it (CODEOWNERS), and it is squash-merged, so
   `main` has one commit per change and is always releasable.
5. A release goes through a pull request too. `pnpm release X.Y.Z` bumps
   every version and dates the Unreleased section on a `release-X.Y.Z`
   branch, runs the gate, pushes it and opens its pull request. Once that is
   merged, `pnpm release tag X.Y.Z` tags `main`, and the tag's workflow
   publishes the image, the npm package and the GitHub release.

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
