// Lint gate. Every rule in eslint.config.js is an error except
// react/jsx-no-literals: until the dashboard has message files, literal text
// in JSX is a warning whose count may only go down (baselines.json).
//   node scripts/lint.mjs           check
//   node scripts/lint.mjs --lower   after moving text out: record the lower count
import { ESLint } from 'eslint'
import { lower, read, write } from './baseline.mjs'

const RULE = 'react/jsx-no-literals'
const eslint = new ESLint({ cwd: new URL('..', import.meta.url).pathname })
const results = await eslint.lintFiles(['src'])
const other = results
  .map((r) => ({ ...r, messages: r.messages.filter((m) => m.ruleId !== RULE) }))
  .filter((r) => r.messages.length)
if (other.length) {
  const fmt = await eslint.loadFormatter('stylish')
  console.log(await fmt.format(other, { cwd: process.cwd(), rulesMeta: {} }))
  console.error('lint: fix the problems above')
  process.exit(1)
}
const count = results.reduce((n, r) => n + r.messages.filter((m) => m.ruleId === RULE).length, 0)
const ceiling = read().literals
console.log(`lint: clean; literal JSX text ${count} (baseline ${ceiling}, may only go down)`)
if (count > ceiling) {
  console.error(`lint: ${count - ceiling} new literal text in JSX; put words in a message file or a constant: npx eslint src --rule '${RULE}: warn' shows where`)
  process.exit(1)
}
if (count < ceiling) {
  if (lower) write('literals', count)
  else console.log(`  lower it: node scripts/lint.mjs --lower (then commit baselines.json)`)
}
