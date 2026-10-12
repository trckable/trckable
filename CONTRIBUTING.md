# Contributing

Thank you for helping. Bug reports, fixes, translations and small improvements
are all welcome; for anything larger, open an issue first so we can agree on
the approach before you spend time on it. Looking for a place to start? Issues
labelled [good first issue](https://github.com/trckable/trckable/labels/good%20first%20issue)
are small and self-contained.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Your first contribution

You need **Go 1.27**, **Node 22 or newer** and **pnpm 12** (`corepack enable`
gives you the right pnpm). No database, no accounts, no `.env` file. Prefer not
to install anything? Open the repository in a dev container (GitHub Codespaces
or VS Code): `.devcontainer/` has all three, and runs `pnpm install` for you.

```bash
git clone https://github.com/<you>/trckable.git     # your fork
cd trckable
pnpm install
pnpm dev
```

`pnpm dev` builds the tracker and the dashboard, starts the server with its
data in `./data` (delete that folder for a clean instance) and the dashboard's
live-reload server beside it. The first start takes a minute; later ones a few
seconds.

1. Open the **setup link** the server prints (`http://localhost:8080/setup#token=...`)
   and create your account.
2. Open **http://localhost:5173** to work on the dashboard: your edits show
   as you save. The server itself is on **http://localhost:8080** (Go changes
   need a restart of `pnpm dev`).
3. Run the tests for what you touched (next section).
4. Commit on a branch, push it to your fork and open a pull request. The
   template lists what a reviewer looks for.

`go run ./bench/demoseed` (in `server/`) fills an instance with realistic demo
traffic.

### Run the tests for what you touched

| You changed | Run |
| --- | --- |
| `server/` | `cd server && go test ./internal/<package>/...` (all: `go test ./...`) |
| `dashboard/` | `cd dashboard && pnpm test` and `pnpm lint` (one area: `pnpm test src/i18n`) |
| `tracker/` | `cd tracker && pnpm test` and `pnpm size` (the size budget) |
| `packages/trckable/` | `cd packages/trckable && pnpm test` |
| a user flow | `cd server && go build -o bin/trckabled ./cmd/trckabled`, then `cd e2e && npx playwright test --project=chromium tests/<name>.spec.ts` (the dashboard and tracker built first, as `pnpm dev` does) |

`pnpm check` at the root runs everything CI runs (a few minutes; it needs the
browsers: `cd e2e && npx playwright install chromium`). You do not have to run
it before opening a pull request: CI does, and tells you what failed.

## Where things live

| Folder | What it is | Its tests |
| --- | --- | --- |
| `server/` | The Go server (`cmd/trckabled`): ingest, the stores, reports, the API, sign-in, payments. The packages are in `server/internal/` | `*_test.go` next to the code |
| `dashboard/` | The React dashboard. `src/features/` one folder per feature, `src/views/` the pages, `src/i18n/` the languages. Embedded into the server on build | `*.test.ts(x)` next to the code (Vitest) |
| `tracker/` | The 2 KB browser script. Built variants land in `server/internal/web/assets/` (committed) | `tracker/test/` (Vitest) |
| `packages/trckable/` | The `trckable` npm package (MIT) | its own `test/` |
| `e2e/` | Playwright: `tests/` for the dashboard flows, `accuracy/` for scripted visitors whose true numbers are known | the folder itself |
| `deploy/`, `charts/` | The Dockerfile, compose file, Helm chart and one-click templates | `scripts/deploy-check.sh` |
| `integrations/` | The WordPress plugin | `e2e/wordpress/` |
| `docs/`, `examples/` | Guides that live in the repository, and small embed examples | none |
| `scripts/` | The tooling behind `pnpm dev`, `check`, `ship` and `release` | `*.test.mjs` next to them |

## Rules for a pull request

- **One change per pull request.** A fix and a clean-up are two pull requests.
- **Behaviour changes come with a test.** A bug fix gets a test that fails
  without the fix.
- **A changelog line.** Anything people will notice gets one line in
  `CHANGELOG.md` under "Unreleased", in the same pull request. A change nobody
  notices (tests, internal clean-ups, CI) is marked with the `no-changelog` label
  (or `[no-changelog]` in a commit message); ask in the pull request if unsure.
- **Commit subjects** are imperative, at most 72 characters, and start with the
  area, as the log does: `Dashboard: space between the period button and the
  comparison pill`, `Payments: search matches word starts`, `Tracker: ...`.
  The pull request title is the same line.
- **Sign the CLA once.** On your first pull request a bot comments; comment
  `I have read the CLA Document and I hereby sign the CLA` ([CLA.md](CLA.md)).
- **Stay inside the size budgets.** The tracker build fails past 2 KB gzip
  (`pnpm size` in `tracker/`), and the dashboard's first load has a budget too.
- **Every visible string is plain English and short**, and every feature works
  when you host trckable yourself: nothing is held back.
- **The tracker build is committed** (`server/internal/web/assets/`): commit it
  together with the source change. The dashboard build is not; it is ignored by
  git.
- A change to the tracker, the npm package or the server's ingest, sessions or
  reports runs the accuracy suite in CI (`e2e/accuracy`): scripted visitors
  whose true numbers are known beforehand, in Chromium, Firefox and WebKit,
  against a real server. Every count must match exactly (only time is a
  range). A bug you fix there gets a scenario: say what the visitor does and
  what the numbers should be. One scenario, one browser:
  `cd e2e && npx playwright test -c accuracy/playwright.config.ts --project=chromium -g "three pages"`
  (after `pnpm --filter trckable build` and a server build in `server/bin`).

## What to expect

We aim to reply to a new issue or pull request within three working days. A
pull request from anyone else needs the maintainer's review (CODEOWNERS), and
is squash-merged once every check is green. Questions, ideas and "how do I...?"
go to [GitHub Discussions](https://github.com/trckable/trckable/discussions),
not to issues. Security problems are reported privately, as [SECURITY.md](SECURITY.md)
describes.

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

## Translations

The dashboard speaks English, German, French, Spanish, Italian and Dutch. English
is the words written in the code (`dashboard/src/**/*opy*.ts`, one `defineCopy('name', {...})`
per feature); every other language is one file of its own in
`dashboard/src/i18n/locales/`, named by two letters (`de.ts`), that holds the same
keys with its words. A key a language does not have shows in English, so a file
can be fixed or grown a few lines at a time, and a missing key never breaks a
screen.

**Fix a word**: edit the line in the language's file and open a pull request, on
GitHub's web editor if you like. The files are marked "needs native review" in
their header: when a native speaker has read one through, that line can go.

**Add a language**: copy `de.ts` to the two letters of the new language
(`pt.ts`), translate the values (never the keys, and keep the arguments of each
function), and add one line for it to `dashboard/src/i18n/languages.ts`. Mark it
`partial: true` there until it is complete: the check then lists what is missing
instead of failing on it. The picker, Auto (the browser's language) and the date
and number formats pick it up from there.

**What a file may hold**: a string, a list of strings (the weekday names, in the
same order) or a function that builds a sentence from the same arguments as the
English one. Plurals use `plural` and `count` from `../helpers` (the language's
own rule: French reads 0 as one), numbers `int`, percentages `pct` and days
`dayLabel`. Import nothing else from the app: a message file is loaded before
the rest of it. Brand and feature names, code, paths and URLs stay as they are.

**The check** runs with the other dashboard tests, in `pnpm check` and in CI:

```bash
cd dashboard && pnpm test src/i18n
```

It lists every key a complete language is missing, every key the English words do
not have, any key whose kind or number of arguments differs, and any function
that leaves out one of the values the English one writes, or writes "undefined".
A new English word in a pull request therefore needs its translations in the
same pull request; if you cannot write them, say so and a maintainer will.

**New English words**: put them in the feature's `*Copy.ts` (not in the
component), formatted with `fmtInt`, `fmtMoney` and the other helpers in
`lib/format.ts` (never `toFixed` or `toLocaleString` without the language), and
use `fmtDay` for days. Where text is joined from pieces, make it one function so
a language can order the pieces its own way.

## Maintainers

Four stages, one command each. `pnpm status` shows open pull requests, their
checks, what is waiting to be released and the version everywhere; `pnpm tidy`
deletes local branches whose pull request is merged.

| Stage | Command | What it does |
| --- | --- | --- |
| 1. Work | `pnpm work <topic>` | A fresh branch from the latest `main`. One topic per branch |
| 2. Land | `pnpm ship` | `pnpm check`, then push and open the pull request; once every check is green it is squash-merged |
| 3. Prepare | `pnpm release X.Y.Z` | Versions bumped, Unreleased notes dated, figures and screenshots refreshed, release pull request opened (`--ship` carries on through merge and publish) |
| 4. Publish | `pnpm release tag X.Y.Z` | After that pull request is merged: tags `main`, waits for the release workflow, checks GitHub, npm and the image |

Six checks are required on `main`: server, tracker and npm package, dashboard,
browsers, image, and the CLA; the changelog line is checked too. Run
`git config core.hooksPath .githooks` once per clone to run the quick checks
before a push to `main`.

## Licensing of contributions

The server and dashboard are AGPL-3.0; the tracker and the npm package are
MIT. On your first pull request a bot asks you to sign the short contributor
licence agreement, [CLA.md](CLA.md), by commenting once. It lets the project
offer the software in other forms, and promises that every accepted
contribution stays available under its open-source licence.
