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

## Before you open a pull request

```bash
pnpm check      # everything CI runs: Go, tracker, dashboard, npm package,
                # a backup round trip and the browser suites
```

- Keep the tracker inside its size budget: the build fails if it grows past it.
- The dashboard and tracker builds are committed (`server/internal/web/`), so
  commit them together with the source change.
- Every visible string is plain English and short. Every feature works in the
  self-hosted edition: nothing is held back for a hosted one.
- New behaviour comes with a test, and a line in CHANGELOG.md under the
  version being prepared.

## Licensing of contributions

The server and dashboard are AGPL-3.0; the tracker and the npm package are
MIT. Before your first pull request is merged you will be asked to sign a
short contributor licence agreement, so the project can keep offering an
optional hosted version while the self-hosted edition stays free and fully
open.
