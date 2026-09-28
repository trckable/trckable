// The counts in baselines.json may only go down. Each check reads its ceiling
// here, fails above it, and with --lower writes a count that went down.
import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../baselines.json', import.meta.url)
export const lower = process.argv.includes('--lower')
export const read = () => JSON.parse(readFileSync(file, 'utf8'))
export function write(key, value) {
  const all = read()
  all[key] = value
  writeFileSync(file, JSON.stringify(all, null, 2) + '\n')
}
