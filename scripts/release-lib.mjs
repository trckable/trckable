// The parts of a release that are plain logic, kept apart from the git, gh and
// network calls in scripts/release.mjs so they can be tested
// (scripts/release-lib.test.mjs, run by CI: node --test scripts/*.test.mjs).

/** Every place that carries the version, and the text that holds it. */
export const VERSION_PLACES = [
  ['tracker/package.json', (v) => `"version": "${v}"`],
  ['packages/trckable/package.json', (v) => `"version": "${v}"`],
  ['server/internal/server/server.go', (v) => `var Version = "${v}"`],
  ['README.md', (v) => `badge/version-${v}-`],
]

/** True when version a is newer than version b (both X.Y.Z). */
export function newer(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

/** The same text with the old version moved to the new one; throws when a place does not carry the old one. */
export function bump(file, text, from, to) {
  const place = VERSION_PLACES.find(([f]) => f === file)
  if (!place) throw new Error(`${file} does not carry the version`)
  const next = text.replace(place[1](from), place[1](to))
  if (next === text) throw new Error(`${file}: nothing to change (${place[1](from)})`)
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
  if (checks.some((c) => c.bucket === 'fail' || c.bucket === 'cancel')) return 'fail'
  if (checks.some((c) => c.bucket === 'pending')) return 'pending'
  const done = new Set(checks.filter((c) => c.bucket === 'pass' || c.bucket === 'skipping').map((c) => c.name))
  return required.every((name) => done.has(name)) ? 'pass' : 'pending'
}
