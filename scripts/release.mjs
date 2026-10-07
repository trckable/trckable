// A release (stages 3 and 4 of ops SHIPPING.md in the site's repo), because
// main takes changes only through pull requests whose checks passed:
//
//   pnpm release 0.2.0 --ship       all of it, one command: prepare, wait for the
//                                   checks, merge, tag, publish, deploy, look live;
//                                   the time of each step at the end
//   pnpm release 0.2.0              prepare only: a release-0.2.0 branch and its pull request
//   pnpm release tag 0.2.0          after that pull request is merged: tag, publish, check
//
//   --no-shots     for a release whose screens did not change (they are only
//                  retaken when their inputs changed anyway)
//   --local-gate   also run the full local gate (scripts/ship.sh --check)
//                  before pushing, for when GitHub Actions is down
//
// Prepare:
// 1. Every place that carries the version gets the new one: VERSION, the
//    tracker and npm package.json files, server.Version and the README badge.
// 2. CHANGELOG.md's "## Unreleased" section becomes "## 0.2.0 (date)", and a
//    fresh empty "## Unreleased" goes above it for the next changes.
// 3. Everything that shows the product catches up in the same pull request:
//    CI's figures (from its latest run on main, which measured this code) in
//    the README, its pictures and the docs; and the screenshots whose inputs
//    changed since they were taken, from a server built of this code (the
//    site's repo's scripts/shots.sh --changed, which starts no demo server
//    when none did). The site's copies are committed in the site's repo.
// 4. On a branch release-0.2.0: the version check and the release scripts'
//    tests, then the branch is pushed and its pull request opened. CI on that
//    pull request is the gate: every check scripts/ship.sh runs (race, crash,
//    backup and restore, the upgrade from the last release, three browsers,
//    WCAG) and more (the image, govulncheck, audits), in parallel.
//
// Tag checks that main carries that version, pushes the tag v0.2.0 (which
// starts .github/workflows/release.yml), waits for that workflow, and then
// looks at the GitHub release, npm and the image as anyone would. It fails if
// one of them is not there.
//
// --ship merges the pull request only once every check main requires passed
// and none failed (main's ruleset enforces the same; nobody can bypass it),
// tags, and while the release workflow runs, checks the site (the site's
// repo's scripts/ship-web.sh --check). Once the release is out, it runs the
// site's repo's scripts/after-release.sh (its deploys), when there is one.
//
// Nothing is merged that is not green, and nothing is tagged that is not on main.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { join } from 'node:path'
import { adminMergeCommand, bump, checksState, cutChangelog, dirtyBeyondFigures, docsVersionMessage, duration, FIGURE_PATHS, mergeBlockedByPolicy, newer, releaseDate, timings, VERSION_PLACES } from './release-lib.mjs'
import { siteRepo } from './site-repo.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const args = process.argv.slice(2)
const TAG = args[0] === 'tag'
const V = args[TAG ? 1 : 0]
const SHIP = args.includes('--ship')
const NO_SHOTS = args.includes('--no-shots')
const LOCAL_GATE = args.includes('--local-gate')
const SITE = siteRepo({ required: false }) // the site, the docs and the figures (its own repo: scripts/site-repo.mjs)
if (!/^\d+\.\d+\.\d+$/.test(V ?? '')) throw new Error('usage: pnpm release X.Y.Z [--ship], or pnpm release tag X.Y.Z')
const run = (cmd, ...a) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit' })
const sh = (cmd, a, cwd = ROOT) => execFileSync(cmd, a, { cwd, encoding: 'utf8' }).trim()
const git = (...a) => sh('git', a)
const sleep = (s) => execFileSync('sleep', [String(s)])
const wait = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000))

// Each step's time, printed at the end (and on the way out when one fails).
const steps = []
let started = Date.now()
const done = (name) => {
  const now = Date.now()
  steps.push({ name, seconds: (now - started) / 1000 })
  console.log(`\x1b[2m  ${name}: ${duration((now - started) / 1000)}\x1b[0m`)
  started = now
}
process.on('exit', () => steps.length > 1 && console.log('\n' + timings(steps)))

// A command in the background: resolves with its exit code.
const background = (cmd, a, cwd) => new Promise((resolve) => {
  const p = spawn(cmd, a, { cwd, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, TRCKABLE_REPO: ROOT } })
  p.on('close', (code) => resolve(code))
  p.on('error', () => resolve(1))
})

// The docs' generated version files, committed in the site's repo as one commit.
// Returns true when there was something to commit.
const DOCS_VERSION_FILES = ['docs/lib/version.ts', 'docs/content/docs/changelog.md', 'docs/content/docs/benchmarks.md', 'ops/facts.json']
function commitDocsVersion(site, siteGit) {
  const changed = DOCS_VERSION_FILES.filter((f) => existsSync(join(SITE, f)) && siteGit('status', '--porcelain', '--', f))
  if (!changed.length) return false
  site('git', 'add', '--', ...changed)
  site('git', 'commit', '-q', '-m', docsVersionMessage(V))
  return true
}

function prepare() {
  const OLD = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()
  if (!newer(V, OLD)) throw new Error(`${V} is not newer than ${OLD}`)
  // The README and its figures are rewritten below: what the site's deploy changed in them is not work to keep.
  if (dirtyBeyondFigures(git('status', '--porcelain')).length) throw new Error('commit or stash your changes first')
  run('git', 'checkout', '-q', '--', ...FIGURE_PATHS)
  if (git('branch', '--show-current') !== 'main') throw new Error('release from main')
  // The site's repo takes part (figures, pictures, screenshots): it must be there, and clean.
  const site = (...a) => execFileSync(a[0], a.slice(1), { cwd: SITE, stdio: 'inherit', env: { ...process.env, TRCKABLE_REPO: ROOT } })
  const siteGit = (...a) => sh('git', a, SITE)
  const notes = []
  if (!SITE) siteRepo() // throws: how to set it
  if (!existsSync(SITE)) throw new Error(`${SITE} is missing: the release updates the figures, pictures and screenshots there too`)
  if (siteGit('status', '--porcelain')) throw new Error(`${SITE} has uncommitted changes: commit them first`)
  run('git', 'pull', '-q', '--ff-only')
  run('git', 'checkout', '-q', '-b', `release-${V}`)

  writeFileSync(join(ROOT, 'VERSION'), V + '\n')
  for (const file of new Set(VERSION_PLACES.map(([f]) => f))) {
    const path = join(ROOT, file)
    writeFileSync(path, bump(file, readFileSync(path, 'utf8'), OLD, V))
  }
  const { log, body } = cutChangelog(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), V, releaseDate(new Date()))
  writeFileSync(join(ROOT, 'CHANGELOG.md'), log)

  // Everything that shows the product catches up in this same pull request,
  // so nothing is left for after the release (ops SHIPPING.md, stage 3):
  // 1. The figures: CI's latest run on main measured exactly this code (this
  //    branch only moves the version), written into the README and its pictures.
  site('node', 'scripts/facts.mjs', 'pull')
  site('node', 'scripts/facts.mjs')
  site('node', 'tools/readme-images/readme.mjs')
  site('node', 'tools/readme-images/features.mjs')
  site('node', 'tools/readme-images/docs-copies.mjs')
  const facts = JSON.parse(readFileSync(join(SITE, 'ops', 'facts.json'), 'utf8'))
  notes.push(`- [x] Figures from CI run ${facts.run} (${facts.commit}), in the README, its pictures and the docs`)
  done('figures')
  // 2. The screenshots whose inputs changed since they were taken, from a
  //    server built of this very code.
  if (NO_SHOTS) notes.push('- [ ] Screenshots: skipped (--no-shots): no screen changed')
  else {
    execFileSync('go', ['build', '-o', 'bin/trckabled', './cmd/trckabled'], { cwd: join(ROOT, 'server'), stdio: 'inherit' })
    const out = execFileSync(join(SITE, 'scripts', 'shots.sh'), ['--changed'], { cwd: SITE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, TRCKABLE_REPO: ROOT } })
    process.stdout.write(out)
    const retaken = out.split('\n').filter((l) => /^\s+(trckable|docs|website)\//.test(l)).length
    const kept = +(out.match(/\((\d+) pictures unchanged/)?.[1] ?? 0)
    notes.push(`- [x] Screenshots: ${retaken} retaken because their inputs changed, ${kept} unchanged and kept`)
    done('screenshots')
  }
  // The docs' version and changelog follow the new VERSION: committed in the
  // site's repo now, so its deploy does not meet a dirty tree later.
  site('node', 'docs/scripts/changelog.mjs')
  if (commitDocsVersion(site, siteGit)) notes.push(`- [x] The docs version committed in the site's repo (${siteGit('log', '-1', '--format=%h')})`)
  if (siteGit('status', '--porcelain')) {
    site('git', 'add', '-A', 'docs', 'website', 'ops')
    site('git', 'commit', '-q', '-m', `Figures and screenshots for ${V}`)
    notes.push(`- [x] The site's copies committed in the site's repo (${siteGit('log', '-1', '--format=%h')})`)
  }
  notes.push(SHIP ? '- [x] `pnpm release --ship`: merged, tagged and deployed once every check is green' : `- [ ] Once merged: \`pnpm release tag ${V}\`, then the site's deploy`)

  run('git', 'add', '-A', 'README.md', '.github/images', 'packages/trckable/README.md')
  run('git', 'commit', '-qam', `${V}`)
  // The quick, local part of the gate; CI on the pull request runs the rest.
  run('node', 'scripts/version-check.mjs')
  execFileSync('node', ['--test', 'scripts/release-lib.test.mjs'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] })
  if (LOCAL_GATE) run('scripts/ship.sh', '--check')
  run('git', 'push', '--no-verify', '-q', '-u', 'origin', `release-${V}`)
  run('gh', 'pr', 'create', '--base', 'main', '--head', `release-${V}`, '--title', `${V}`, '--body', `Release ${V}. What changed:\n\n${body}\n\nWith it:\n\n${notes.join('\n')}\n\nThe checks on this pull request are the release gate. Once they pass and it is merged: \`pnpm release tag ${V}\` tags main, waits for the release workflow and checks GitHub, npm and the image.`)
  done('push, pull request')
}

// Until every check main requires passed, or any check failed. At most 40 minutes.
function waitForChecks() {
  const repo = sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
  const required = sh('gh', ['api', `repos/${repo}/rules/branches/main`, '-q', '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context']).split('\n').filter(Boolean)
  console.log(`\nWaiting for the checks on release-${V} (${required.length} required)…`)
  for (let i = 0; i < 160; i++) {
    let out
    try { out = sh('gh', ['pr', 'checks', `release-${V}`, '--json', 'name,bucket']) } catch (e) { out = String(e.stdout ?? '').trim() } // gh exits 8 while checks are pending
    const checks = out.startsWith('[') ? JSON.parse(out) : []
    const state = checksState(checks, required)
    if (state === 'pass') return done('checks on the pull request')
    if (state === 'fail') {
      const failed = checks.filter((c) => c.bucket === 'fail' || c.bucket === 'cancel').map((c) => c.name)
      throw new Error(`checks failed on release-${V}: ${failed.join(', ')}. Nothing is merged: fix it on the branch; once it is merged, pnpm release tag ${V}`)
    }
    sleep(15)
  }
  throw new Error(`the checks on release-${V} did not finish in 40 minutes: gh pr checks release-${V}`)
}

function merge() {
  // No bypass: main's ruleset takes it only with every required check green.
  try {
    execFileSync('gh', ['pr', 'merge', `release-${V}`, '--squash', '--delete-branch', '--subject', V], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] })
  } catch (e) {
    const text = String(e.stderr ?? '')
    process.stderr.write(text)
    if (!mergeBlockedByPolicy(text)) throw e
    console.error(`\nMain's rules do not allow this merge yet. If you are sure, merge with the rights to bypass:\n\n  ${adminMergeCommand(V)}\n\nThen: pnpm release tag ${V}`)
    process.exit(1)
  }
  run('git', 'checkout', '-q', 'main')
  run('git', 'pull', '-q', '--ff-only')
  if (git('branch', '--list', `release-${V}`)) run('git', 'branch', '-q', '-D', `release-${V}`)
  done('merge')
}

async function tag() {
  // Only what is on main, and only the version main says it is.
  run('git', 'checkout', '-q', 'main')
  run('git', 'pull', '-q', '--ff-only')
  const onMain = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()
  if (onMain !== V) throw new Error(`main is at ${onMain}, not ${V}: merge the release-${V} pull request first`)
  if (git('tag', '-l', `v${V}`)) throw new Error(`v${V} is already tagged`)
  run('git', 'tag', '-a', `v${V}`, '-m', `trckable ${V}`)
  run('git', 'push', '-q', 'origin', `v${V}`)
  console.log(`\nv${V} is tagged. Waiting for the release workflow (the image, the npm package, the GitHub release)…`)

  // Meanwhile the site is built and checked against this version, so only
  // its deploy is left for after.
  const siteCheck = SHIP && existsSync(join(SITE, 'scripts', 'ship-web.sh'))
    ? background(join(SITE, 'scripts', 'ship-web.sh'), ['--check'], SITE)
    : null

  let id = ''
  for (let i = 0; i < 30 && !id; i++) {
    id = sh('gh', ['run', 'list', '--workflow', 'release.yml', '--branch', `v${V}`, '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId'])
    if (!id) await wait(5)
  }
  if (!id) throw new Error(`no release workflow started for v${V}: see the repository's Actions`)
  const watched = await background('gh', ['run', 'watch', id, '--exit-status', '--interval', '10'], ROOT)
  if (watched !== 0) throw new Error(`the release workflow failed: gh run view ${id} --log-failed. The tag stays; fix and re-run the failed jobs (gh run rerun ${id} --failed)`)
  done('release workflow')

  // Not done until it is out: each place people get trckable from, as they would.
  const checks = []
  const check = (what, ok, how) => { checks.push(ok); console.log(`${ok ? '\x1b[32m✓' : '\x1b[31m✗'} ${what}\x1b[0m${ok ? '' : ' — ' + how}`) }
  const release = sh('gh', ['release', 'view', `v${V}`, '--json', 'tagName,isDraft', '-q', '.tagName + " " + (.isDraft|tostring)'])
  check(`GitHub release v${V}`, release === `v${V} false`, `gh release view v${V}`)
  // npm takes a moment to show a new version everywhere.
  let npm = ''
  for (let i = 0; i < 60 && npm !== V; i++) {
    try { npm = sh('npm', ['view', `trckable@${V}`, 'version', '--prefer-online']) } catch { npm = '' }
    if (npm !== V) sleep(5)
  }
  check(`npm trckable@${V}`, npm === V, 'npm view trckable versions (the npm job in the workflow)')
  const token = JSON.parse(sh('curl', ['-s', 'https://ghcr.io/token?scope=repository:trckable/trckable:pull'])).token
  const tags = JSON.parse(sh('curl', ['-s', '-H', `Authorization: Bearer ${token}`, 'https://ghcr.io/v2/trckable/trckable/tags/list'])).tags ?? []
  check(`image ghcr.io/trckable/trckable:${V} and :latest`, tags.includes(V) && tags.includes('latest'), 'the image jobs in the workflow')
  if (checks.includes(false)) process.exit(1)
  done('live: GitHub, npm, image')

  if (!SHIP) {
    console.log(`\n${V} is out. Last step: pnpm --dir ${SITE} web:ship (the site and the docs), then pnpm status`)
    return
  }
  if (siteCheck) {
    if ((await siteCheck) !== 0) throw new Error(`${V} is out, but the site's check failed (above): fix it, then pnpm --dir ${SITE} web:ship`)
    done('site check (the rest of it, beyond the workflow)')
    // The site's build regenerates the docs version: committed, so web:ship accepts the tree.
    const siteGit = (...a) => sh('git', a, SITE)
    const site = (...a) => execFileSync(a[0], a.slice(1), { cwd: SITE, stdio: 'inherit' })
    if (commitDocsVersion(site, siteGit)) console.log(`The docs version committed in the site's repo (${siteGit('log', '-1', '--format=%h')})`)
  }
  const after = join(SITE, 'scripts', 'after-release.sh')
  if (!existsSync(after)) {
    console.log(`\n${V} is out. Last step: pnpm --dir ${SITE} web:ship, then pnpm status`)
    return
  }
  execFileSync(after, [V], { cwd: SITE, stdio: 'inherit', env: { ...process.env, TRCKABLE_REPO: ROOT } })
  done("deploys (the site's repo)")
  console.log(`\n\x1b[32m✓ ${V} is out and deployed.\x1b[0m`)
}

if (TAG) await tag()
else {
  prepare()
  if (SHIP) {
    waitForChecks()
    merge()
    await tag()
  } else console.log(`\nrelease-${V} is pushed and its pull request is open. Merge it once its checks pass, then: pnpm release tag ${V} (or all of it next time: pnpm release ${V} --ship)`)
}
