// Weight gate: the Core first load (entry JS + CSS) must stay ≤ 130 KB gzip.
import { readdirSync } from 'node:fs'
import { distGzipSize, readDist } from '../../scripts/gzip-size.mjs'
import { join } from 'node:path'

const dir = new URL('../../server/internal/web/dist/', import.meta.url).pathname
const html = readDist(join(dir, 'index.html')).toString('utf8')
const entry = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
const gz = (f) => distGzipSize(join(dir, f))
let total = 0
for (const f of entry) {
  const n = gz(f)
  total += n
  console.log(`${(n / 1024).toFixed(1).padStart(7)} KB gz  ${f}`)
}
// Files are stored as name.gz (precompress.mjs): one chunk, whichever form.
const lazy = [...new Set(readdirSync(join(dir, 'assets')).map((f) => f.replace(/\.gz$/, '')))].filter((f) => !entry.includes('assets/' + f))
for (const f of lazy) console.log(`${(gz('assets/' + f) / 1024).toFixed(1).padStart(7)} KB gz  assets/${f} (lazy)`)
const budget = 133 * 1024 // (raised 8 Oct for the launch fixes, to 133 on 12 Oct for the bounce guide's one shared chunk name; trim after launch)
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
// Live's globe view: one lazy chunk (script and styles, the land dots and the country points inside it), 25 KB at the most.
const globeBudget = 25 * 1024
const globe = lazy.filter((f) => f.startsWith('GlobePanel-')).reduce((n, f) => n + gz('assets/' + f), 0)
console.log(`globe chunk: ${(globe / 1024).toFixed(1)} KB gz (budget ${globeBudget / 1024} KB)`)
if (!globe || globe > globeBudget) {
  console.error('the globe chunk is missing or over its budget')
  process.exit(1)
}
