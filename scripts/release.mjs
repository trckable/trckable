// A release, in one command:
//
//   pnpm release 0.2.0
//
// 1. Every place that carries the version gets the new one: VERSION, the
//    tracker and npm package.json files, server.Version and the README badge.
// 2. CHANGELOG.md's "## Unreleased" section becomes "## 0.2.0 (date)", and a
//    fresh empty "## Unreleased" goes above it for the next changes.
// 3. The full gate runs and main is pushed (scripts/ship.sh), then the tag
//    v0.2.0 is pushed. The tag starts .github/workflows/release.yml, which
//    publishes the image, the npm package and the GitHub release.
//
// Nothing is pushed unless the gate passes.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const V = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(V ?? '')) throw new Error('usage: pnpm release X.Y.Z')
const OLD = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()
const newer = (a, b) => { const [x, y] = [a, b].map((v) => v.split('.').map(Number)); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false }
if (!newer(V, OLD)) throw new Error(`${V} is not newer than ${OLD}`)
const run = (cmd, ...args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' })
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
if (git('status', '--porcelain')) throw new Error('commit or stash your changes first')
if (git('branch', '--show-current') !== 'main') throw new Error('release from main')

const edit = (file, from, to) => {
  const path = join(ROOT, file)
  const text = readFileSync(path, 'utf8')
  const next = text.replace(from, to)
  if (next === text) throw new Error(`${file}: nothing to change (${from})`)
  writeFileSync(path, next)
}
writeFileSync(join(ROOT, 'VERSION'), V + '\n')
for (const f of ['tracker/package.json', 'packages/trckable/package.json']) edit(f, `"version": "${OLD}"`, `"version": "${V}"`)
edit('server/internal/server/server.go', `var Version = "${OLD}"`, `var Version = "${V}"`)
edit('README.md', `badge/version-${OLD}-`, `badge/version-${V}-`)

const log = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
const body = log.match(/## Unreleased\n([\s\S]*?)(?=\n## )/)?.[1].trim()
if (!body) throw new Error('CHANGELOG.md: the "## Unreleased" section is empty; write down what changed first')
const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
writeFileSync(join(ROOT, 'CHANGELOG.md'), log.replace('## Unreleased\n', `## Unreleased\n\n## ${V} (${date})\n`))

run('git', 'commit', '-qam', `${V}`)
run('scripts/ship.sh')
run('git', 'tag', '-a', `v${V}`, '-m', `trckable ${V}`)
run('git', 'push', '-q', 'origin', `v${V}`)
console.log(`\nv${V} is tagged: the release workflow now publishes the image, the npm package and the GitHub release.`)
