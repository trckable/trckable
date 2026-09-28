// Components stay under 250 lines. The ones already over are listed in
// baselines.json with their length; each may shrink but not grow, and no new
// one may cross the line.
//   node scripts/component-size.mjs           check
//   node scripts/component-size.mjs --lower   after a split: record the new lengths
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { lower, read, write } from './baseline.mjs'

const LIMIT = 250
const root = new URL('..', import.meta.url).pathname
const files = readdirSync(join(root, 'src'), { recursive: true })
  .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
  .map((f) => relative(root, join(root, 'src', f)))
  .sort()
const base = read().components
const now = {}
const grew = []
for (const f of files) {
  const lines = readFileSync(join(root, f), 'utf8').split('\n').length - 1
  if (lines <= LIMIT) continue
  now[f] = lines
  if (!(f in base)) grew.push(`${f}: ${lines} lines, over ${LIMIT} (new)`)
  else if (lines > base[f]) grew.push(`${f}: ${lines} lines, was ${base[f]}`)
}
const over = Object.keys(now).length
console.log(`components: ${over} over ${LIMIT} lines${grew.length ? '' : ', none longer than its baseline'}`)
if (grew.length) {
  console.error(grew.map((g) => '  ' + g).join('\n'))
  console.error(`components: split the files above (a component over ${LIMIT} lines does too much)`)
  process.exit(1)
}
const shrank = Object.keys(base).filter((f) => (now[f] ?? 0) < base[f])
if (shrank.length) {
  if (lower) write('components', now)
  else console.log(`  ${shrank.length} got shorter: node scripts/component-size.mjs --lower (then commit baselines.json)`)
}
