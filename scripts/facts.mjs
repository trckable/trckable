// The numbers trckable publishes (README, trckable.com, the docs) are measured
// here, by CI, on every push to main, and uploaded as the "facts-*" artifacts
// of that run. Nothing is typed in by hand: the site and the README read them.
//
//   node scripts/facts.mjs tracker     after the tracker and npm package builds
//   node scripts/facts.mjs dashboard   after the dashboard build
//   node scripts/facts.mjs image       with IMAGE_BYTES and IDLE_MIB set
//   node scripts/facts.mjs accuracy    with ACCURACY_DIR: the accuracy suite's results, one file a browser
//
// Sizes are gzip level 9, bytes. Megabytes are MiB, rounded up.
import { appendFileSync, readFileSync, readdirSync } from 'node:fs'
// The image and accuracy jobs measure no sizes and install no packages: load gzip only when needed.
const { gzipSize, distGzipSize, readDist } = ['image', 'accuracy'].includes(process.argv[2]) ? {} : await import('./gzip-size.mjs')
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const gz = (f) => gzipSize(readFileSync(join(ROOT, f)))
const up1 = (n) => Math.ceil(n * 10) / 10
// A budget is read from the file that enforces it, never copied here: a copy
// said 2,048 bytes for weeks after the tracker's real budget became 2,060.
const budget = (file, re) => {
  const m = readFileSync(join(ROOT, file), 'utf8').match(re)
  if (!m) throw new Error(`${file}: no budget found (${re})`)
  return +m[1]
}

const parts = {
  tracker: () => {
    // sizes.json is what tracker/build.mjs measured, and what the dashboard's
    // Modules page shows, so the site and the product quote the same bytes.
    const sz = JSON.parse(readFileSync(join(ROOT, 'server/internal/web/assets/sizes.json'), 'utf8'))
    // A site has the cookie bar (b) or reads another banner (n), never both.
    const servable = Object.entries(sz.variants).filter(([k]) => !(k.includes('n') && k.includes('b')))
    return {
    tracker_bytes: sz.full, // /js/t.js: goals, outbound links, checkout
    tracker_core_bytes: sz.core, // pageviews only
    tracker_max_bytes: Math.max(...servable.map(([, n]) => n)), // every module a site can turn on
    ...Object.fromEntries(Object.entries(sz.feature).map(([f, n]) => ['module_' + f + '_bytes', n])),
    tracker_budget_bytes: budget('tracker/build.mjs', /^const BUDGET = (\d+)/m),
    tracker_heat_budget_bytes: budget('tracker/build.mjs', /^const HEAT_BUDGET = (\d+)/m), // the heatmaps module, a script of its own
    react_bytes: gz('packages/trckable/dist/react.js') + gz('packages/trckable/dist/index.js'),
    react_budget_bytes: budget('packages/trckable/build.mjs', /^const BUDGET = (\d+)/m),
    }
  },
  dashboard: () => {
    const dir = 'server/internal/web/dist/'
    const html = readDist(join(ROOT, dir, 'index.html')).toString('utf8')
    const entry = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
    const total = entry.reduce((n, f) => n + distGzipSize(join(ROOT, dir + f)), 0)
    // The milestones timeline and share sheet, loaded only when opened.
    const milestones = readdirSync(join(ROOT, dir, 'assets')).map((f) => f.replace(/\.gz$/, '')).filter((f, i, all) => f.startsWith('MilestonesDialogs-') && all.indexOf(f) === i).reduce((n, f) => n + distGzipSize(join(ROOT, dir + 'assets/' + f)), 0)
    return {
      dashboard_kb: up1(total / 1024),
      dashboard_budget_kb: budget('dashboard/scripts/size.mjs', /^const budget = (\d+) \* 1024/m),
      milestones_chunk_kb: up1(milestones / 1024),
      milestones_chunk_budget_kb: budget('dashboard/scripts/size.mjs', /^const milestonesBudget = (\d+) \* 1024/m),
    }
  },
  // The accuracy suite (e2e/accuracy, and the TestAccuracy… Go tests): scripted
  // visitors with known truth, every number compared exactly. It fails, with
  // the scenarios that were not exact, when anything was less than exact, when
  // a browser is missing, or when a browser ran other scenarios than another.
  accuracy: () => {
    const dir = process.env.ACCURACY_DIR
    if (!dir) throw new Error('ACCURACY_DIR is not set')
    const runs = []
    for (const f of readdirSync(dir).sort()) {
      if (/^accuracy-.+\.json$/.test(f)) for (const r of JSON.parse(readFileSync(join(dir, f), 'utf8')).runs) runs.push(r)
      if (f === 'accuracy-go.jsonl') {
        for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
          if (!line.trim().startsWith('{')) continue
          const e = JSON.parse(line)
          if (!e.Test || e.Test.includes('/') || !['pass', 'fail'].includes(e.Action)) continue
          const words = e.Test.replace(/^TestAccuracy/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase()
          runs.push({ scenario: words, project: 'go', kind: 'server', exact: e.Action === 'pass', checks: [] })
        }
      }
    }
    if (!runs.length) throw new Error(`no accuracy results in ${dir}`)
    const browsers = [...new Set(runs.map((r) => r.project).filter((p) => p !== 'go'))].sort()
    const wrong = []
    for (const b of ['chromium', 'firefox', 'webkit']) if (!browsers.includes(b)) wrong.push(`no results from ${b}`)
    // Every browser ran the same scenarios, or the number "N scenarios, 3 browsers" is not true.
    const titles = (b) => new Set(runs.filter((r) => r.project === b).map((r) => r.scenario))
    const all = new Set(runs.filter((r) => r.project !== 'go').map((r) => r.scenario))
    for (const b of browsers) for (const t of all) if (!titles(b).has(t)) wrong.push(`${b} did not run: ${t}`)
    for (const r of runs) if (!r.exact) wrong.push(`${r.project}: ${r.scenario}${r.checks.filter((c) => !c.ok).map((c) => ` (${c.name}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)})`).join('')}`)
    const checks = runs.flatMap((r) => r.checks)
    const out = {
      accuracy_scenarios: new Set(runs.map((r) => r.scenario)).size,
      accuracy_browser_scenarios: all.size,
      accuracy_browsers: browsers.length,
      accuracy_runs: runs.length,
      accuracy_checks: checks.length,
      accuracy_exact_percent: Math.round((runs.filter((r) => r.exact).length / runs.length) * 1000) / 10,
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      const lines = [`### Accuracy: ${out.accuracy_exact_percent}% exact`, '', `${out.accuracy_scenarios} scenarios, ${out.accuracy_browsers} browsers, ${out.accuracy_runs} runs, ${out.accuracy_checks} numbers compared.`, '']
      for (const w of wrong) lines.push(`- ${w}`)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
    }
    if (wrong.length) {
      console.log(JSON.stringify(out, null, 2))
      throw new Error('accuracy is not exact:\n  ' + wrong.join('\n  '))
    }
    return out
  },
  image: () => ({
    image_mb: up1(+process.env.IMAGE_BYTES / 1048576),
    image_budget_mb: budget('.github/workflows/ci.yml', /\(budget (\d+) MB\)/),
    memory_idle_mb: Math.ceil(+process.env.IDLE_MIB),
    memory_budget_mb: budget('.github/workflows/ci.yml', /idle memory ≤ (\d+) MB/),
  }),
}

const part = parts[process.argv[2]]
if (!part) throw new Error('usage: node scripts/facts.mjs tracker|dashboard|image|accuracy')
const out = part()
for (const [k, v] of Object.entries(out)) if (!Number.isFinite(v)) throw new Error(`${k} is not a number`)
console.log(JSON.stringify(out, null, 2))
