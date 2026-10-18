// Builds the browser script and enforces the weight budget (≤ 2.0 KB
// gzip), once per feature combination.
//
//   node build.mjs          build every variant into dist/ and the server's embed dir
//   node build.mjs --check  the same, failing if any variant is over budget
//
// A site's script contains only the features its modules turn on: with goals,
// outbound links and checkout attribution all off, a visitor downloads the
// core script and nothing else. sizes.json records what each feature costs so
// the dashboard can show it honestly.
import { build } from 'esbuild'
import { gzipSize } from '../scripts/gzip-size.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// 2,060 since 24 Sep 2026: a visitor who declines is never counted, and the
// first page waits for their answer; those rules cost 20 bytes (2,031 → 2,051).
// 2,048 since 26 Sep 2026: trimmed back under 2 KB, so "a 2 KB script" stays true.
// 2,088 since 12 Oct 2026: a tab brought back after 30 minutes counts a new view,
// and an open page says "still here" once a minute (34 bytes). 2,092 since 13 Oct
// 2026: that "still here" goes every 3 minutes, back on screen within one (4 bytes).
// 2,318 since 18 Oct 2026: the Web Vitals are measured the way the web-vitals
// library defines them (INP by interaction, a layout shift of 0 reported, nothing
// counted for a page loaded in the background, a prerendered page timed from its
// activation, the last entries read when the page is hidden): 247 bytes on a new
// site's script (2,068 → 2,315). The classic snippet without them is 2,095.
const BUDGET = 2318 // bytes, gzip, for the full script: 2 KB, as the site says
const TARGET = 1638 // 1.6 KB goal

// Keep in sync with server/internal/modules (Tracker* constants).
const FEATURES = [
  ['goals', 'g', '__GOALS__'],
  ['outbound', 'o', '__OUTBOUND__'],
  ['checkout', 'c', '__CHECKOUT__'],
  ['vitals', 'v', '__VITALS__'],
  ['consent', 'n', '__CONSENT__'],
  ['banner', 'b', '__BANNER__'],
  ['forms', 'f', '__FORMS__'],
]

// The budget is about the script trckable ships by default: goals and Core Web
// Vitals (checked below). The other optional features cost what they cost,
// visibly, in Settings → General → What the script records. Every variant
// without them still has to fit BUDGET.
const OPTIONAL = new Set(['vitals', 'consent', 'banner', 'forms'])
// 2,700 since 24 Sep 2026 (was 2,560): the consent module's decline rules add
// about 120 bytes, and the heaviest optional mix is 2,689.
// 2,740 since 12 Oct 2026, the same 34 bytes; 2,744 since 13 Oct, the same 4.
// 2,984 since 18 Oct 2026, the Web Vitals above (heaviest mix 2,979).
const WITH_OPTIONAL_BUDGET = 2984

// trckable's own cookie bar carries markup, styles and words, so it has a
// budget of its own. It replaces a consent manager that costs 30–90 KB, and
// it is off unless a site asks for it.
const BANNER_BUDGET = 3690 // 3,400 until 12 Oct 2026, the same 34 bytes; 3,452 since 13 Oct, the same change; 3,690 since 18 Oct, the Web Vitals

// The heatmaps module is a script of its own, sent after the base script only
// to a site that turned it on, so none of it counts against BUDGET. It has a
// budget of its own: 1.5 KB gzip.
const HEAT_BUDGET = 1536

// The bar and the read-someone-else's-banner module answer the same question,
// so a site has one or the other (modules.Module.Excludes). The variant with
// both is built for completeness but no site is ever served it, so it is not
// what the budget is about.
const IMPOSSIBLE = new Set(['n', 'b'])

/** "core", "g", "gc", "gco"… one name per combination, features in order. */
const variantName = (on) => FEATURES.filter(([f]) => on.has(f)).map(([, code]) => code).join('') || 'core'

async function buildVariant(on) {
  const name = variantName(on)
  const outfile = `dist/t-${name}.js`
  await build({
    entryPoints: ['src/script.ts'],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020', 'safari14'],
    outfile,
    legalComments: 'none',
    banner: { js: '/*! trckable MIT */' },
    define: Object.fromEntries(FEATURES.map(([f, , flag]) => [flag, String(on.has(f))])),
  })
  // The IIFE doesn't rely on strict mode; the directive is 13 bytes we skip.
  writeFileSync(outfile, readFileSync(outfile, 'utf8').replace('"use strict";', ''))
  const js = readFileSync(outfile)
  return { name, bytes: js.length, gzip: gzipSize(js), js }
}

mkdirSync('dist', { recursive: true })
const combos = []
for (let mask = 0; mask < 1 << FEATURES.length; mask++) {
  combos.push(new Set(FEATURES.filter((_, i) => mask & (1 << i)).map(([f]) => f)))
}
const built = {}
for (const on of combos) {
  const v = await buildVariant(on)
  built[v.name] = v
}

// t.js is the classic data-site snippet: everything except the optional
// modules, so the one-liner keeps the size it promises.
const all = built[variantName(new Set(FEATURES.map(([f]) => f).filter((f) => !OPTIONAL.has(f))))]
const everything = built[variantName(new Set(FEATURES.map(([f]) => f)))]
const core = built.core

// /js/t.js stays the full script: the classic snippet with data-site keeps working.
writeFileSync('dist/t.js', all.js)
mkdirSync('../server/internal/web/assets', { recursive: true })
writeFileSync('../server/internal/web/assets/t.js', all.js)
for (const v of Object.values(built)) writeFileSync(`../server/internal/web/assets/t-${v.name}.js`, v.js)

// The heatmaps module: one file, appended to a site's script by the server.
// No banner and no strict-mode line: it follows the base script in the same file.
await build({
  entryPoints: ['src/heat.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'safari14'],
  outfile: 'dist/heat.js',
  legalComments: 'none',
})
const heatJs = readFileSync('dist/heat.js')
const heatGzip = gzipSize(heatJs)
writeFileSync('../server/internal/web/assets/heat.js', heatJs)

// What each feature costs on its own, measured (core + feature − core).
const cost = {}
for (const [f, code] of FEATURES) cost[f] = built[code].gzip - core.gzip
cost.heat = heatGzip // Keep in sync with modules.TrackHeat
// Outbound links and forms ship only with Goals and share code with it, so on
// a site that has Goals they cost less than on their own: that is the size the
// list shows.
const onGoals = {}
for (const f of ['outbound', 'forms']) {
  onGoals[f] = built[variantName(new Set(['goals', f]))].gzip - built[variantName(new Set(['goals']))].gzip
}
writeFileSync(
  '../server/internal/web/assets/sizes.json',
  JSON.stringify({ core: core.gzip, full: all.gzip, feature: cost, feature_on_goals: onGoals, variants: Object.fromEntries(Object.entries(built).map(([k, v]) => [k, v.gzip])) }, null, 2) + '\n',
)

// The corner script for the "online" widget is its own file with its own
// budget, and the tracker never includes it.
const ONLINE_BUDGET = 1024 // bytes, gzip
await build({ entryPoints: ['src/online.ts'], bundle: true, minify: true, format: 'iife', target: ['es2020', 'safari14'], outfile: 'dist/online.js', legalComments: 'none' })
const online = readFileSync('dist/online.js')
writeFileSync('../server/internal/web/assets/online.js', online)
const onlineGzip = gzipSize(online)

const budgetFor = (name) => {
  if (name.includes('b')) return BANNER_BUDGET
  if (FEATURES.some(([f, code]) => OPTIONAL.has(f) && name.includes(code))) return WITH_OPTIONAL_BUDGET
  return BUDGET
}

const mark = (gz) => (gz <= TARGET ? '✓ under target' : gz <= BUDGET ? '✓ within budget' : '✗ OVER BUDGET')
console.log(`t.js (the classic snippet): ${all.bytes} B minified · ${all.gzip} B gzip (budget ${BUDGET}, target ${TARGET}) ${mark(all.gzip)}`)
const heaviest = built[variantName(new Set(FEATURES.map(([f]) => f).filter((f) => f !== 'consent')))]
console.log(`the most a site can ship: ${heaviest.bytes} B minified · ${heaviest.gzip} B gzip (budget ${budgetFor(heaviest.name)}) ${heaviest.gzip <= budgetFor(heaviest.name) ? '✓' : '✗ OVER'}`)
console.log(`core only:            ${core.bytes} B minified · ${core.gzip} B gzip ${mark(core.gzip)}`)
for (const [f] of FEATURES) console.log(`  + ${f.padEnd(9)} ${String(cost[f]).padStart(4)} B gzip`)
console.log(`heatmaps module (a script of its own): ${heatJs.length} B minified · ${heatGzip} B gzip (budget ${HEAT_BUDGET}) ${heatGzip <= HEAT_BUDGET ? '✓' : '✗ OVER'}`)

console.log(`online.js (the corner widget): ${online.length} B minified · ${onlineGzip} B gzip (budget ${ONLINE_BUDGET}) ${onlineGzip <= ONLINE_BUDGET ? '✓' : '✗ OVER BUDGET'}`)
if (onlineGzip > ONLINE_BUDGET) {
  console.error(`✗ online.js is ${onlineGzip} B gzip, over its ${ONLINE_BUDGET} B budget`)
  if (process.argv.includes('--check')) process.exit(1)
}

// A new site ships goals and Core Web Vitals, so that script is held to the
// 2 KB the site says, not to the looser budget for optional features.
const fresh = built[variantName(new Set(['goals', 'vitals']))]
console.log(`a new site's script (goals + vitals): ${fresh.bytes} B minified · ${fresh.gzip} B gzip (budget ${BUDGET}) ${fresh.gzip <= BUDGET ? '✓' : '✗ OVER'}`)
if (fresh.gzip > BUDGET) console.error(`✗ the default script (goals + vitals) is ${fresh.gzip} B gzip, over ${BUDGET}`)
if (process.argv.includes('--check') && fresh.gzip > BUDGET) process.exit(1)

const possible = ([name]) => !([...IMPOSSIBLE].every((c) => name.includes(c)))
const overBudget = Object.entries(built).filter(possible).filter(([name, v]) => v.gzip > budgetFor(name))
for (const [name, v] of overBudget) console.error(`✗ variant ${name} is ${v.gzip} B gzip, over budget`)
if (heatGzip > HEAT_BUDGET) console.error(`✗ the heatmaps module is ${heatGzip} B gzip, over its budget of ${HEAT_BUDGET}`)
if (process.argv.includes('--check') && (overBudget.length || heatGzip > HEAT_BUDGET)) process.exit(1)
