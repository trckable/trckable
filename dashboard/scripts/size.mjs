// Weight gate: the Core first load (entry JS + CSS) must stay ≤ 130 KB gzip.
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSize } from '../../scripts/gzip-size.mjs'
import { join } from 'node:path'

const dir = new URL('../../server/internal/web/dist/', import.meta.url).pathname
const html = readFileSync(join(dir, 'index.html'), 'utf8')
const entry = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
const gz = (f) => gzipSize(readFileSync(join(dir, f)))
let total = 0
for (const f of entry) {
  const n = gz(f)
  total += n
  console.log(`${(n / 1024).toFixed(1).padStart(7)} KB gz  ${f}`)
}
// The compressed twins (precompress.mjs) are not chunks of their own.
const lazy = readdirSync(join(dir, 'assets')).filter((f) => !entry.includes('assets/' + f) && !/\.(?:br|gz)$/.test(f))
for (const f of lazy) console.log(`${(gz('assets/' + f) / 1024).toFixed(1).padStart(7)} KB gz  assets/${f} (lazy)`)
const budget = 130 * 1024
console.log(`first load: ${(total / 1024).toFixed(1)} KB gz (budget ${budget / 1024} KB)`)
if (total > budget) {
  console.error('over the weight budget')
  process.exit(1)
}
// The milestones timeline and share sheet: one lazy chunk, its script and styles.
const milestonesBudget = 6 * 1024
const milestones = lazy.filter((f) => f.startsWith('MilestonesDialogs-')).reduce((n, f) => n + gz('assets/' + f), 0)
console.log(`milestones chunk: ${(milestones / 1024).toFixed(1)} KB gz (budget ${milestonesBudget / 1024} KB)`)
if (!milestones || milestones > milestonesBudget) {
  console.error('the milestones chunk is missing or over its budget')
  process.exit(1)
}
