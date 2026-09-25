// Where everything stands, on one screen: this repo, its pull requests, what
// is waiting to be released, and the version at each place people get
// trckable from. Read-only; it changes nothing.
//
//   pnpm status
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const CLOUD = join(ROOT, '..', 'trckable-cloud')
const sh = (cmd, args, cwd = ROOT) => {
  try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}
const B = (s) => `\x1b[1m${s}\x1b[0m`
const G = (s) => `\x1b[32m${s}\x1b[0m`
const Y = (s) => `\x1b[33m${s}\x1b[0m`
const R = (s) => `\x1b[31m${s}\x1b[0m`
const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`)

sh('git', ['fetch', '-q', '--prune', 'origin'])
const local = (cwd, name) => {
  const branch = sh('git', ['branch', '--show-current'], cwd)
  const dirty = sh('git', ['status', '--porcelain'], cwd).split('\n').filter(Boolean).length
  const ahead = sh('git', ['rev-list', '--count', `origin/${branch}..HEAD`], cwd)
  console.log(B(`\n${name}`))
  line('branch', branch + (dirty ? Y(`  · ${dirty} uncommitted`) : '') + (ahead && ahead !== '0' ? Y(`  · ${ahead} not pushed`) : ahead === '' ? Y('  · not on GitHub yet') : ''))
}

local(ROOT, 'trckable (public)')
const others = sh('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter((b) => b && b !== 'main' && b !== sh('git', ['branch', '--show-current']))
if (others.length) line('other branches', others.join(', '))

const prs = JSON.parse(sh('gh', ['pr', 'list', '--json', 'number,title,headRefName,statusCheckRollup,mergeStateStatus']) || '[]')
console.log(B('\nPull requests'))
if (!prs.length) line('open', G('none'))
for (const p of prs) {
  const runs = p.statusCheckRollup ?? []
  const bad = runs.filter((c) => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(c.conclusion)).length
  const wait = runs.filter((c) => c.status && c.status !== 'COMPLETED').length
  const state = bad ? R(`${bad} failing`) : wait ? Y(`${wait} running`) : G('all green')
  line(`#${p.number} ${p.headRefName}`.slice(0, 22), `${state}  ${p.title.slice(0, 60)}`)
}

console.log(B('\nWaiting to be released'))
const log = sh('git', ['show', 'origin/main:CHANGELOG.md'])
const unreleased = (log.match(/## Unreleased\n([\s\S]*?)(?=\n## \d)/)?.[1] ?? '').split('\n').filter((l) => l.startsWith('- '))
line('changelog lines', unreleased.length ? Y(`${unreleased.length} under Unreleased on main`) : G('none: main is released'))

console.log(B('\nVersions'))
const want = sh('git', ['show', 'origin/main:VERSION'])
const mark = (v) => (v === want ? G(v) : v ? Y(v) : R('not found'))
line('main (VERSION)', want)
line('GitHub release', mark(sh('gh', ['release', 'view', '--json', 'tagName', '-q', '.tagName']).replace(/^v/, '')))
line('npm trckable', mark(sh('npm', ['view', 'trckable', 'version'])))
const token = (() => { try { return JSON.parse(sh('curl', ['-s', 'https://ghcr.io/token?scope=repository:trckable/trckable:pull'])).token } catch { return '' } })()
const tags = (() => { try { return JSON.parse(sh('curl', ['-s', '-H', `Authorization: Bearer ${token}`, 'https://ghcr.io/v2/trckable/trckable/tags/list'])).tags ?? [] } catch { return [] } })()
line('Docker image', tags.includes(want) ? G(want) : R(`no ${want} tag`))
const docs = sh('curl', ['-sf', `https://trckable.com/docs/?status=${Date.now()}`])
const onSite = [...new Set(docs.match(/\b\d+\.\d+\.\d+\b/g) ?? [])].includes(want)
line('trckable.com docs', onSite ? G(want) : Y(`not ${want} yet: pnpm --dir ${CLOUD} web:ship`))

if (existsSync(CLOUD)) local(CLOUD, 'trckable-cloud (private: site, docs, Cloud)')
const shots = existsSync(join(CLOUD, 'ops', 'shots.json')) ? Object.keys(JSON.parse(readFileSync(join(CLOUD, 'ops', 'shots.json'), 'utf8'))).length : 0
if (shots) line('screenshots', `${shots} recorded (retaken at release time when their screen changes)`)
console.log('')
