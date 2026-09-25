// A release, in two commands (stages 3 and 4 of ops SHIPPING.md in
// trckable-cloud), because main takes changes only through pull requests
// whose checks passed:
//
//   pnpm release 0.2.0              prepare it: a release-0.2.0 branch and its pull request
//   pnpm release 0.2.0 --no-shots   the same, for a release whose screens did not change
//   pnpm release tag 0.2.0          after that pull request is merged: tag, publish, check
//
// The first:
// 1. Every place that carries the version gets the new one: VERSION, the
//    tracker and npm package.json files, server.Version and the README badge.
// 2. CHANGELOG.md's "## Unreleased" section becomes "## 0.2.0 (date)", and a
//    fresh empty "## Unreleased" goes above it for the next changes.
// 3. Everything that shows the product catches up in the same pull request:
//    CI's figures (from its latest run on main, which measured this code) in
//    the README, its pictures and the docs; and the screenshots whose screen
//    changed since they were taken, from a server built of this code
//    (trckable-cloud/scripts/shots.sh --changed). The site's copies are
//    committed in trckable-cloud and go live with its web:ship.
// 4. On a branch release-0.2.0: the full gate runs (scripts/ship.sh), the
//    branch is pushed, and its pull request is opened with a checklist.
//
// The second checks that main carries that version, pushes the tag v0.2.0
// (which starts .github/workflows/release.yml), waits for that workflow, and
// then looks at the GitHub release, npm and the image as anyone would. It
// fails if one of them is not there.
//
// Nothing is pushed unless the gate passes, and nothing is tagged that is not
// on main.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const TAG = process.argv[2] === 'tag'
const V = process.argv[TAG ? 3 : 2]
const NO_SHOTS = process.argv.includes('--no-shots') // a fix-only release whose screens did not change
const CLOUD = join(ROOT, '..', 'trckable-cloud') // the site, the docs and the figures (private)
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
  console.log(`\nv${V} is tagged. Waiting for the release workflow (the image, the npm package, the GitHub release)…`)

  // Not done until it is out: wait for the workflow, then look at each place
  // people get trckable from, as they would.
  const sh = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' }).trim()
  const sleep = (s) => execFileSync('sleep', [String(s)])
  let id = ''
  for (let i = 0; i < 30 && !id; i++) {
    id = sh('gh', ['run', 'list', '--workflow', 'release.yml', '--branch', `v${V}`, '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId'])
    if (!id) sleep(5)
  }
  if (!id) throw new Error(`no release workflow started for v${V}: see github.com/trckable/trckable/actions`)
  try {
    execFileSync('gh', ['run', 'watch', id, '--exit-status', '--interval', '15'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] })
  } catch {
    throw new Error(`the release workflow failed: gh run view ${id} --log-failed. The tag stays; fix and re-run the failed jobs (gh run rerun ${id} --failed)`)
  }
  const checks = []
  const check = (what, ok, how) => { checks.push(ok); console.log(`${ok ? '\x1b[32m✓' : '\x1b[31m✗'} ${what}\x1b[0m${ok ? '' : ' — ' + how}`) }
  const release = sh('gh', ['release', 'view', `v${V}`, '--json', 'tagName,isDraft', '-q', '.tagName + " " + (.isDraft|tostring)'])
  check(`GitHub release v${V}`, release === `v${V} false`, `gh release view v${V}`)
  // npm takes a few minutes to show a new version everywhere.
  let npm = ''
  for (let i = 0; i < 20 && npm !== V; i++) {
    try { npm = sh('npm', ['view', `trckable@${V}`, 'version']) } catch { npm = '' }
    if (npm !== V) sleep(15)
  }
  check(`npm trckable@${V}`, npm === V, 'npm view trckable versions (the npm job in the workflow)')
  const token = JSON.parse(sh('curl', ['-s', 'https://ghcr.io/token?scope=repository:trckable/trckable:pull'])).token
  const tags = JSON.parse(sh('curl', ['-s', '-H', `Authorization: Bearer ${token}`, 'https://ghcr.io/v2/trckable/trckable/tags/list'])).tags ?? []
  check(`image ghcr.io/trckable/trckable:${V} and :latest`, tags.includes(V) && tags.includes('latest'), 'the image job in the workflow')
  if (checks.includes(false)) process.exit(1)
  console.log(`\n${V} is out. Last step: pnpm --dir ${join(ROOT, '..', 'trckable-cloud')} web:ship (the site and the docs), then pnpm status`)
  process.exit(0)
}

const OLD = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()
const newer = (a, b) => { const [x, y] = [a, b].map((v) => v.split('.').map(Number)); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false }
if (!newer(V, OLD)) throw new Error(`${V} is not newer than ${OLD}`)
if (git('status', '--porcelain')) throw new Error('commit or stash your changes first')
if (git('branch', '--show-current') !== 'main') throw new Error('release from main')
// The site's repo takes part (figures, pictures, screenshots): it must be there, and clean.
const cloud = (...args) => execFileSync(args[0], args.slice(1), { cwd: CLOUD, stdio: 'inherit' })
const cloudGit = (...args) => execFileSync('git', args, { cwd: CLOUD, encoding: 'utf8' }).trim()
const notes = []
if (!existsSync(CLOUD)) throw new Error(`${CLOUD} is missing: the release updates the figures, pictures and screenshots there too`)
if (cloudGit('status', '--porcelain')) throw new Error('trckable-cloud has uncommitted changes: commit them first')
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

// Everything that shows the product catches up in this same pull request, so
// nothing is left for after the release (ops SHIPPING.md, stage 3):
// 1. The figures: CI's latest run on main measured exactly this code (this
//    branch only moves the version), written into the README and its pictures.
cloud('node', 'scripts/facts.mjs', 'pull')
cloud('node', 'scripts/facts.mjs')
cloud('node', 'tools/readme-images/readme.mjs')
cloud('node', 'tools/readme-images/features.mjs')
cloud('node', 'tools/readme-images/docs-copies.mjs')
const facts = JSON.parse(readFileSync(join(CLOUD, 'ops', 'facts.json'), 'utf8'))
notes.push(`- [x] Figures from CI run ${facts.run} (${facts.commit}), in the README, its pictures and the docs`)
// 2. The screenshots whose screen changed since they were taken, from a server
//    built of this very code.
if (NO_SHOTS) notes.push('- [ ] Screenshots: skipped (--no-shots): no screen changed')
else {
  execFileSync('go', ['build', '-o', 'bin/trckabled', './cmd/trckabled'], { cwd: join(ROOT, 'server'), stdio: 'inherit' })
  const out = execFileSync(join(CLOUD, 'scripts', 'shots.sh'), ['--changed'], { cwd: CLOUD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  process.stdout.write(out)
  const retaken = out.split('\n').filter((l) => /^\s+(trckable|docs|website)\//.test(l)).length
  const kept = +(out.match(/\((\d+) pictures unchanged/)?.[1] ?? 0)
  notes.push(`- [x] Screenshots: ${retaken} retaken because their screen changed, ${kept} unchanged and kept`)
}
if (cloudGit('status', '--porcelain')) {
  cloud('git', 'add', '-A', 'docs', 'website', 'ops')
  cloud('git', 'commit', '-q', '-m', `Figures and screenshots for ${V}`)
  notes.push(`- [x] The site's copies committed in trckable-cloud (${cloudGit('log', '-1', '--format=%h')}); they go live with pnpm web:ship`)
}
notes.push('- [ ] After the tag: `pnpm --dir ../trckable-cloud web:ship`, then look at trckable.com, its demo and the docs')

run('git', 'add', '-A', 'README.md', '.github/images', 'packages/trckable/README.md')
run('git', 'commit', '-qam', `${V}`)
run('scripts/ship.sh') // the full gate, then push release-${V}
run('gh', 'pr', 'create', '--base', 'main', '--head', `release-${V}`, '--title', `${V}`, '--body', `Release ${V}. What changed:\n\n${body}\n\nWith it:\n\n${notes.join('\n')}\n\nOnce this is merged: \`pnpm release tag ${V}\` tags main, waits for the release workflow and checks GitHub, npm and the image.`)
console.log(`\nrelease-${V} is pushed and its pull request is open. Merge it once its checks pass, then: pnpm release tag ${V}`)
