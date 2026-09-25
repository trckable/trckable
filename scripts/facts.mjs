// The numbers trckable publishes (README, trckable.com, the docs) are measured
// here, by CI, on every push to main, and uploaded as the "facts-*" artifacts
// of that run. Nothing is typed in by hand: the site and the README read them.
//
//   node scripts/facts.mjs tracker     after the tracker and npm package builds
//   node scripts/facts.mjs dashboard   after the dashboard build
//   node scripts/facts.mjs image       with IMAGE_BYTES and IDLE_MIB set
//
// Sizes are gzip level 9, bytes. Megabytes are MiB, rounded up.
import { readFileSync } from 'node:fs'
// The image job measures no sizes and installs no packages: load gzip only when needed.
const { gzipSize } = process.argv[2] === 'image' ? {} : await import('./gzip-size.mjs')
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
    react_bytes: gz('packages/trckable/dist/react.js') + gz('packages/trckable/dist/index.js'),
    react_budget_bytes: budget('packages/trckable/build.mjs', /^const BUDGET = (\d+)/m),
    }
  },
  dashboard: () => {
    const dir = 'server/internal/web/dist/'
    const html = readFileSync(join(ROOT, dir, 'index.html'), 'utf8')
    const entry = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
    const total = entry.reduce((n, f) => n + gz(dir + f), 0)
    return { dashboard_kb: up1(total / 1024), dashboard_budget_kb: budget('dashboard/scripts/size.mjs', /^const budget = (\d+) \* 1024/m) }
  },
  image: () => ({
    image_mb: up1(+process.env.IMAGE_BYTES / 1048576),
    image_budget_mb: budget('.github/workflows/ci.yml', /\(budget (\d+) MB\)/),
    memory_idle_mb: Math.ceil(+process.env.IDLE_MIB),
    memory_budget_mb: budget('.github/workflows/ci.yml', /idle memory ≤ (\d+) MB/),
  }),
}

const part = parts[process.argv[2]]
if (!part) throw new Error('usage: node scripts/facts.mjs tracker|dashboard|image')
const out = part()
for (const [k, v] of Object.entries(out)) if (!Number.isFinite(v)) throw new Error(`${k} is not a number`)
console.log(JSON.stringify(out, null, 2))
