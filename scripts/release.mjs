// A release, in two commands, because main takes changes only through pull
// requests whose checks passed (a GitHub ruleset nobody can bypass):
//
//   pnpm release 0.2.0       prepare it: a release-0.2.0 branch and its pull request
//   pnpm release tag 0.2.0   after that pull request is merged: tag main, and publish
//
// The first:
// 1. Every place that carries the version gets the new one: VERSION, the
//    tracker and npm package.json files, server.Version and the README badge.
// 2. CHANGELOG.md's "## Unreleased" section becomes "## 0.2.0 (date)", and a
//    fresh empty "## Unreleased" goes above it for the next changes.
// 3. On a branch release-0.2.0: the full gate runs (scripts/ship.sh), the
//    branch is pushed, and its pull request is opened.
//
// The second checks that main carries that version, then pushes the tag
// v0.2.0, which starts .github/workflows/release.yml: it publishes the image,
// the npm package and the GitHub release.
//
// Nothing is pushed unless the gate passes, and nothing is tagged that is not
// on main.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const TAG = process.argv[2] === 'tag'
const V = process.argv[TAG ? 3 : 2]
if (!/^\d+\.\d+\.\d+$/.test(V ?? '')) throw new Error('usage: pnpm release X.Y.Z, then pnpm release tag X.Y.Z')
const run = (cmd, ...args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' })
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

if (TAG) {
  // Only what is on main, and only the version main says it is.
  run('git', 'checkout', '-q', 'main')
  run('git', 'pull', '-q', '--ff-only')
  const onMain = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()
  if (onMain !== V) throw new Error(`main is at ${onMain}, not ${V}: merge the release-${V} pull request first`)
  if (git('tag', '-l', `v${V}`)) throw new Error(`v${V} is already tagged`)
  run('git', 'tag', '-a', `v${V}`, '-m', `trckable ${V}`)
  run('git', 'push', '-q', 'origin', `v${V}`)
  console.log(`\nv${V} is tagged: the release workflow now publishes the image, the npm package and the GitHub release.`)
  process.exit(0)
}

const OLD = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()
const newer = (a, b) => { const [x, y] = [a, b].map((v) => v.split('.').map(Number)); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false }
if (!newer(V, OLD)) throw new Error(`${V} is not newer than ${OLD}`)
if (git('status', '--porcelain')) throw new Error('commit or stash your changes first')
if (git('branch', '--show-current') !== 'main') throw new Error('release from main')
run('git', 'pull', '-q', '--ff-only')
run('git', 'checkout', '-q', '-b', `release-${V}`)

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
const now = new Date()
const date = `${now.getUTCDate()} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[now.getUTCMonth()]} ${now.getUTCFullYear()}` // 24 Sep 2026
writeFileSync(join(ROOT, 'CHANGELOG.md'), log.replace('## Unreleased\n', `## Unreleased\n\n## ${V} (${date})\n`))

run('git', 'commit', '-qam', `${V}`)
run('scripts/ship.sh') // the full gate, then push release-${V}
run('gh', 'pr', 'create', '--base', 'main', '--head', `release-${V}`, '--title', `${V}`, '--body', `Release ${V}. What changed:\n\n${body}\n\nOnce this is merged: \`pnpm release tag ${V}\` tags main and publishes.`)
console.log(`\nrelease-${V} is pushed and its pull request is open. Merge it once its checks pass, then: pnpm release tag ${V}`)
