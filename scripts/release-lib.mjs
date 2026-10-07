// The parts of a release that are plain logic, kept apart from the git, gh and
// network calls in scripts/release.mjs so they can be tested
// (scripts/release-lib.test.mjs, run by CI: node --test scripts/*.test.mjs).

/** Every place that carries the version, and the text that holds it. */
export const VERSION_PLACES = [
  ['tracker/package.json', (v) => `"version": "${v}"`],
  ['packages/trckable/package.json', (v) => `"version": "${v}"`],
  ['server/internal/server/server.go', (v) => `var Version = "${v}"`],
  ['README.md', (v) => `badge/version-${v}-`],
  // The deploy templates pin the release's image (the Umbrel package, whose
  // digest changes with it, is refreshed when it is submitted).
  ['deploy/compose.yml', (v) => `ghcr.io/trckable/trckable:${v}`],
  ['deploy/coolify/trckable.yaml', (v) => `ghcr.io/trckable/trckable:${v}`],
  ['deploy/dokploy/docker-compose.yml', (v) => `ghcr.io/trckable/trckable:${v}`],
  ['deploy/dokploy/meta.json', (v) => `"version": "${v}"`],
  ['deploy/README.md', (v) => `ghcr.io/trckable/trckable:${v}`],
  ['deploy/README.md', (v) => `--branch v${v}`],
  ['charts/trckable/Chart.yaml', (v) => `version: ${v}\nappVersion: "${v}"`],
]

/** True when version a is newer than version b (both X.Y.Z). */
export function newer(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

/** The same text with the old version moved to the new one; throws when a place does not carry the old one. */
export function bump(file, text, from, to) {
  const places = VERSION_PLACES.filter(([f]) => f === file)
  if (!places.length) throw new Error(`${file} does not carry the version`)
  const next = places.reduce((t, [, carries]) => t.replaceAll(carries(from), carries(to)), text)
  if (next === text) throw new Error(`${file}: nothing to change (${places[0][1](from)})`)
  return next
}

/**
 * Which places do not carry version v: the VERSION file's, read with read(file).
 * Empty when everything agrees. The CHANGELOG needs a section for v.
 */
export function versionMismatches(v, read) {
  const off = VERSION_PLACES.filter(([f, text]) => !read(f).includes(text(v))).map(([f]) => f)
  if (!new RegExp(`^## ${v.replace(/\./g, '\\.')}( |$)`, 'm').test(read('CHANGELOG.md'))) off.push('CHANGELOG.md')
  return off
}

/** "24 Sep 2026", in UTC. */
export function releaseDate(now) {
  return `${now.getUTCDate()} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[now.getUTCMonth()]} ${now.getUTCFullYear()}`
}

/** The changelog with "## Unreleased" cut into a section for v, and the notes that section holds. */
export function cutChangelog(log, v, date) {
  const body = log.match(/## Unreleased\n([\s\S]*?)(?=\n## |$)/)?.[1].trim()
  if (!body) throw new Error('CHANGELOG.md: the "## Unreleased" section is empty; write down what changed first')
  return { log: log.replace('## Unreleased\n', `## Unreleased\n\n## ${v} (${date})\n`), body }
}

/** 75 → "1m 15s", 9 → "9s". */
export function duration(seconds) {
  const s = Math.round(seconds)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/** The table printed at the end: each step, its time, and the total. */
export function timings(steps) {
  const width = Math.max(5, ...steps.map((s) => s.name.length))
  const total = steps.reduce((n, s) => n + s.seconds, 0)
  return [...steps.map((s) => `  ${s.name.padEnd(width)}  ${duration(s.seconds).padStart(7)}`), `  ${'total'.padEnd(width)}  ${duration(total).padStart(7)}`].join('\n')
}

/**
 * gh pr checks --json name,bucket → where the pull request stands, against
 * the checks main requires (their names): "fail" on the first failed or
 * cancelled check of any kind, "pass" once every required one passed or was
 * skipped and nothing else is still running, "pending" otherwise (a required
 * check that has not even started yet included).
 */
export function checksState(checks, required) {
  if (checks.length === 0) return 'pending' // none registered yet: the pull request was only just pushed
  if (checks.some((c) => c.bucket === 'fail' || c.bucket === 'cancel')) return 'fail'
  if (checks.some((c) => c.bucket === 'pending')) return 'pending'
  const done = new Set(checks.filter((c) => c.bucket === 'pass' || c.bucket === 'skipping').map((c) => c.name))
  return required.every((name) => done.has(name)) ? 'pass' : 'pending'
}

/**
 * The README and its figure pictures are rewritten by the figures step, so a
 * change in them (the site's deploy makes one) is not "uncommitted work".
 * Returns the `git status --porcelain` lines that are.
 */
export const FIGURE_PATHS = ['README.md', '.github/images/readme']
export function dirtyBeyondFigures(porcelain) {
  return porcelain.split('\n').filter((line) => {
    if (!line.trim()) return false
    const path = line.slice(3).replace(/^"|"$/g, '')
    return !(path === 'README.md' || (path.startsWith('.github/images/readme/') && path.endsWith('.svg')))
  })
}

/** True when a failed `gh pr merge` was main's rules refusing it (checks, reviews). */
export function mergeBlockedByPolicy(text) {
  return /base branch policy prohibits the merge/i.test(String(text))
}

/** The one command that merges anyway, for a person with the rights to run it. */
export function adminMergeCommand(v) {
  return `gh pr merge release-${v} --squash --delete-branch --subject ${v} --admin`
}

/** The commit message for the docs version written into the site's repo. */
export const docsVersionMessage = (v) => `docs: version ${v}`
