// Which tests a pull request needs, from the files it changes (the "what
// changed" job in .github/workflows/ci.yml). A small dashboard change runs its
// own browser specs and the accessibility pass, not all of them; a Go change
// runs its packages and every package that depends on them.
//
// Safe by default: a file no rule knows runs everything, and so do main,
// release pull requests (release-*), the nightly run and a manual run. The
// required checks report either way; a job with nothing to do passes.
//
// WebKit is the slow browser. A pull request runs the full Chromium and
// Firefox suites (or the specs it changed) and, on WebKit, the key specs below
// plus the changed ones. A full run (main, a release, the nightly run, a
// manual run, or any change this script cannot place) runs the whole suite on
// WebKit, in parallel shards; the required browsers check refuses to pass
// without them.
//
//   node scripts/ci-select.mjs <base>   writes the selection to $GITHUB_OUTPUT (or prints it)
//   FULL=1 node scripts/ci-select.mjs   everything
import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// Dashboard source → the browser specs that exercise it (e2e/tests/<name>.spec.ts).
// Prefixes; the first match wins. What is not here runs every spec.
const DASHBOARD = [
  ['dashboard/src/features/cookieless/', ['cookieless']],
  ['dashboard/src/features/create/', ['fullcharts']],
  ['dashboard/src/features/fullcharts/', ['fullcharts']],
  ['dashboard/src/features/install/', ['install', 'methods', 'onboarding']],
  ['dashboard/src/features/journey/', ['journey']],
  ['dashboard/src/features/live/', ['live', 'livemode', 'journey']],
  ['dashboard/src/features/notes/', ['notes', 'chart-hover']],
  ['dashboard/src/features/onboarding/', ['onboarding', 'install']],
  ['dashboard/src/features/sites/', ['switcher', 'unknown-site', 'icon-crop']],
  ['dashboard/src/charts/', ['chart-hover', 'fullcharts', 'notes']],
  ['dashboard/src/components/crop/', ['icon-crop']],
  ['dashboard/src/components/AvatarCrop', ['icon-crop']],
  ['dashboard/src/components/loading/', ['loading']],
  ['dashboard/src/components/NoteDialog', ['notes']],
  ['dashboard/src/components/SitePicker', ['switcher', 'unknown-site']],
  ['dashboard/src/components/visitor/', ['journey', 'livemode']],
  ['dashboard/src/lib/install', ['install', 'methods', 'onboarding']],
  ['dashboard/src/lib/live', ['live', 'livemode', 'journey']],
  ['dashboard/src/lib/useLive', ['live', 'livemode', 'journey']],
  ['dashboard/src/lib/landing', ['landing']],
]

// The specs every pull request also runs on WebKit: the tracker and the live
// stream, the install paths, and the screens Safari has broken before.
const WEBKIT_SMOKE = ['chart-hover', 'cookieless', 'install', 'journey', 'landing', 'live', 'methods', 'onboarding', 'switcher', 'tracking']
const WEBKIT_SHARDS = 3 // the whole browser suite on WebKit
const WEBKIT_DEMO_SHARDS = 2 // the accessibility pass and the Full charts on WebKit

const PROSE = /(\.md$|^(docs|\.github)\/.*\.(png|jpe?g|gif|svg|webp)$)/
const EMBEDDED = /^server\/internal\/web\/(dist|assets)\//
const ALL = 'all'

/** An empty selection: nothing to run. */
const none = () => ({ full: false, race: false, server: new Set(), crash: false, e2e: new Set(), demo: false, dashboard: false, tracker: false, image: false, accuracy: false })

/** Everything, as on main. */
export const everything = () => ({ full: true, race: true, server: ALL, crash: true, e2e: ALL, demo: true, dashboard: true, tracker: true, image: true, accuracy: true })

/** The selection for a list of changed files. */
export function select(files) {
  const s = none()
  const addE2e = (specs) => { if (s.e2e !== ALL) specs === ALL ? (s.e2e = ALL) : specs.forEach((x) => s.e2e.add(x)) }
  const addServer = (dir) => { if (s.server !== ALL) dir === ALL ? (s.server = ALL) : s.server.add(dir) }
  for (const f of files) {
    if (PROSE.test(f)) continue
    // Built output, committed next to its source: its source's rule decides.
    if (EMBEDDED.test(f)) { s.image = true; continue }
    if (f.startsWith('dashboard/')) {
      s.dashboard = true
      if (/\.test\.tsx?$/.test(f)) continue // unit tests: the dashboard job runs them
      s.image = true
      if (!f.startsWith('dashboard/src/')) { addE2e(ALL); s.demo = true; continue } // config, dependencies
      s.demo = true // the accessibility pass and the Full charts, on every screen change
      addE2e(DASHBOARD.find(([p]) => f.startsWith(p))?.[1] ?? ALL)
      continue
    }
    if (f.startsWith('server/')) {
      if (/^server\/go\.(mod|sum)$/.test(f)) { addServer(ALL); s.race = s.crash = s.image = true; addE2e(ALL); s.demo = true; continue }
      const dir = f.slice(0, f.lastIndexOf('/'))
      addServer('./' + dir.slice('server/'.length))
      s.race = true
      if (f.endsWith('_test.go') || f.includes('/testdata/')) continue // only its own package
      if (f.startsWith('server/bench/')) { s.crash = true; continue }
      s.crash = s.image = s.demo = s.accuracy = true
      addE2e(ALL) // the API the dashboard and the tracker talk to
      continue
    }
    if (f.startsWith('tracker/')) { s.tracker = s.image = true; if (!/\.test\.ts$/.test(f)) { addE2e(ALL); s.accuracy = true } continue }
    if (f.startsWith('packages/trckable/')) { s.tracker = true; if (!/\.test\.tsx?$/.test(f)) { addE2e(['methods', 'landing']); s.accuracy = true } continue }
    // The accuracy suite: scripted visitors with known truth (e2e/accuracy).
    if (f.startsWith('e2e/accuracy/')) { s.accuracy = true; continue }
    const spec = f.match(/^e2e\/tests\/([\w-]+)\.spec\.ts$/)
    if (spec) { spec[1] === 'a11y' || spec[1] === 'fullcharts' ? (s.demo = true) : addE2e([spec[1]]); continue }
    if (f === 'deploy/Dockerfile') { s.image = true; continue }
    // The release scripts: the "what changed" job itself runs their tests.
    if (/^scripts\/(release|release-lib|version-check|ci-select)(\.test)?\.mjs$/.test(f)) continue
    return everything() // not known: all of it
  }
  // Specs that only run against the demo server belong to that job.
  if (s.e2e !== ALL) { if (s.e2e.delete('fullcharts')) s.demo = true }
  return s
}

/** One job per shard: its name, the browser, the shard ("" when whole) and the specs ("all" or names). */
const jobs = (browser, shards, specs) => Array.from({ length: shards }, (_, i) => ({
  name: shards > 1 ? `${browser} ${i + 1}/${shards}` : browser,
  browser,
  shard: shards > 1 ? `${i + 1}/${shards}` : '',
  specs,
}))

const names = (v) => (v === ALL ? ALL : [...v].sort().join(' '))

/** The browser jobs. Chromium and Firefox run what was selected; WebKit runs it all in shards on a full run, else the key specs and the changed ones. */
export function browserMatrix(s) {
  if (s.e2e !== ALL && s.e2e.size === 0) return []
  const webkit = s.full ? jobs('webkit', WEBKIT_SHARDS, ALL) : jobs('webkit', 1, names(s.e2e === ALL ? new Set(WEBKIT_SMOKE) : new Set([...WEBKIT_SMOKE, ...s.e2e])))
  return [...jobs('chromium', 1, names(s.e2e)), ...jobs('firefox', 1, names(s.e2e)), ...webkit]
}

/** The accessibility and demo-data jobs: Chromium on a pull request, all three on a full run. */
export function demoMatrix(s) {
  if (!s.demo) return []
  return [...jobs('chromium', 1, ALL), ...(s.full ? [...jobs('firefox', 1, ALL), ...jobs('webkit', WEBKIT_DEMO_SHARDS, ALL)] : [])]
}

// A job whose matrix is empty is skipped by its own condition, but the matrix must still parse.
const matrix = (m) => JSON.stringify(m.length ? m : jobs('none', 1, ALL).map((j) => ({ ...j, browser: 'chromium' })))

/** The selection as GitHub Actions outputs: strings. */
export function outputs(s) {
  const flag = (b) => (b ? 'true' : 'false')
  const code = s.full || s.server === ALL || s.server.size > 0 || s.e2e === ALL || s.e2e.size > 0 || s.demo || s.dashboard || s.tracker || s.image || s.crash || s.accuracy
  return {
    code: flag(code), full: flag(s.full), server: flag(s.race), race: flag(s.race), server_pkgs: names(s.server),
    crash: flag(s.crash), e2e: names(s.e2e), demo: flag(s.demo), dashboard: flag(s.dashboard), tracker: flag(s.tracker), image: flag(s.image), accuracy: flag(s.accuracy),
    browsers: matrix(browserMatrix(s)), demo_browsers: matrix(demoMatrix(s)),
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const base = process.argv[2]
  const files = base ? execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean) : []
  const out = outputs(process.env.FULL === '1' || !base ? everything() : select(files))
  const text = Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
  process.stdout.write(text)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text)
}
