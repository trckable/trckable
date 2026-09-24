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
const lazy = readdirSync(join(dir, 'assets')).filter((f) => !entry.includes('assets/' + f))
for (const f of lazy) console.log(`${(gz('assets/' + f) / 1024).toFixed(1).padStart(7)} KB gz  assets/${f} (lazy)`)
const budget = 130 * 1024
console.log(`first load: ${(total / 1024).toFixed(1)} KB gz (budget ${budget / 1024} KB)`)
if (total > budget) {
  console.error('over the weight budget')
  process.exit(1)
}
