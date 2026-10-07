# Contributing

Thank you for helping. Bug reports, fixes and small improvements are all
welcome; for anything larger, open an issue first so we can agree on the
approach before you spend time on it.

## Build and run

You need Go 1.27, Node 22 and pnpm 12.

```bash
pnpm install
git config core.hooksPath .githooks    # runs the quick checks before a push

cd dashboard && pnpm build && cd ..     # the dashboard is embedded in the server (not committed: build it)
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
- A change to the tracker, the npm package or the server's ingest, sessions or
  reports runs the accuracy suite in CI (`e2e/accuracy`): scripted visitors
  whose true numbers are known beforehand, in Chromium, Firefox and WebKit,
  against a real server. Every count must match exactly (only time is a
  range). A bug you fix there gets a scenario: say what the visitor does and
  what the numbers should be. One scenario, one browser:
  `cd e2e && npx playwright test -c accuracy/playwright.config.ts --project=chromium -g "three pages"`
  (after `pnpm --filter trckable build` and a server build in `server/bin`).
- The tracker build (`server/internal/web/assets/`) is committed, so commit it
  together with the source change. The dashboard build is not: it is ignored by
  git, and CI and the Docker image build it.
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

## Licensing of contributions

The server and dashboard are AGPL-3.0; the tracker and the npm package are
MIT. On your first pull request a bot asks you to sign the short contributor
licence agreement, [CLA.md](CLA.md), by commenting once. It lets the project
offer the software in other forms, and promises that every accepted
contribution stays available under its open-source licence.
