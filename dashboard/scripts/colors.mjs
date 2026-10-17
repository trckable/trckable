// New pages take their colours from theme tokens (mock/theme.css, with a value for each theme), not from
// literals: a hex or rgb() written in a rule or a component is right in one theme and a bug in the other.
// Token definitions (--name: value) do not count. The count may only go down (baselines.json).
//   node scripts/colors.mjs           check
//   node scripts/colors.mjs --lower   after moving colours into tokens: record the lower count
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { lower, read, write } from './baseline.mjs'

const root = new URL('../src/', import.meta.url).pathname
const LITERAL = /(?<!&)#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g
const DEFINITION = /--[\w-]+\s*:\s*[^;}]+/g

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(tsx?|css)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

const mine = [join(root, 'mock/mock.css'), ...files(join(root, 'v2')).filter((f) => !f.endsWith('.css') || f.includes('/v2/'))]
let count = 0
const where = []
for (const f of mine) {
  const n = (readFileSync(f, 'utf8').replace(DEFINITION, '').match(LITERAL) ?? []).length
  count += n
  if (n) where.push(`${f.slice(root.length)} ${n}`)
}
const ceiling = read().colors
console.log(`colors: ${count} literal colours in the new pages' styles and components (baseline ${ceiling}, may only go down)`)
if (count > ceiling) {
  console.error(`colors: ${count - ceiling} new; use a token from mock/theme.css (give it a light value there):\n  ${where.join('\n  ')}`)
  process.exit(1)
}
if (count < ceiling) {
  if (lower) write('colors', count)
  else console.log('  lower it: node scripts/colors.mjs --lower (then commit baselines.json)')
}
