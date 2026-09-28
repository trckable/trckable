// One version everywhere: the VERSION file's, in every place that carries it,
// and a CHANGELOG section for it. Run by scripts/ship.sh and by CI, so a
// release pull request is checked for it without a local gate.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { versionMismatches } from './release-lib.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const V = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()
const off = versionMismatches(V, (f) => readFileSync(join(ROOT, f), 'utf8'))
if (off.length) {
  console.error(`not version ${V} (the VERSION file): ${off.join(', ')}`)
  process.exit(1)
}
console.log(`version ${V} everywhere`)
