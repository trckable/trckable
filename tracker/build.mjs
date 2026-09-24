// Builds the browser script and enforces the weight budget (plan §2: ≤ 2.0 KB
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

const BUDGET = 2048 // bytes, gzip, for the full script
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

// The budget is about the script trckable ships by default. Core Web Vitals is
// a performance-measurement module a site asks for, and it costs what it
// costs — visibly, in the modules page, before anyone turns it on. Every
// variant without it still has to fit BUDGET.
const OPTIONAL = new Set(['vitals', 'consent', 'banner', 'forms'])
const WITH_OPTIONAL_BUDGET = 2560

// trckable's own cookie bar carries markup, styles and words, so it has a
// budget of its own. It replaces a consent manager that costs 30–90 KB, and
// it is off unless a site asks for it.
const BANNER_BUDGET = 3328

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

// What each feature costs on its own, measured (core + feature − core).
const cost = {}
for (const [f, code] of FEATURES) cost[f] = built[code].gzip - core.gzip
writeFileSync(
  '../server/internal/web/assets/sizes.json',
  JSON.stringify({ core: core.gzip, full: all.gzip, feature: cost, variants: Object.fromEntries(Object.entries(built).map(([k, v]) => [k, v.gzip])) }, null, 2) + '\n',
)

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

const possible = ([name]) => !([...IMPOSSIBLE].every((c) => name.includes(c)))
const overBudget = Object.entries(built).filter(possible).filter(([name, v]) => v.gzip > budgetFor(name))
for (const [name, v] of overBudget) console.error(`✗ variant ${name} is ${v.gzip} B gzip, over budget`)
if (process.argv.includes('--check') && overBudget.length) process.exit(1)
