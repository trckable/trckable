// Every change people will notice carries its own line in CHANGELOG.md, under
// "## Unreleased", in the same pull request. Written at the end, a release's
// notes are a memory exercise; written with the change, they are just true.
//
//   node scripts/changelog-check.mjs [base]    base defaults to origin/main
//
// A change that nobody notices (a test, CI, a comment, a refactor) is marked
// instead: the label no-changelog on its pull request (CI passes the labels
// in PR_LABELS), or "[no-changelog]" in a commit message on the branch.
import { execFileSync } from 'node:child_process'

const base = process.argv[2] || 'origin/main'
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
const files = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean)

// What ships to people: the server, the dashboard, the tracker, the npm package.
const shipped = (f) =>
  /^(server\/(cmd|internal)\/|dashboard\/src\/|tracker\/src\/|packages\/trckable\/src\/)/.test(f) &&
  !/(_test\.go|\.test\.tsx?)$/.test(f)
const touched = files.filter(shipped)
if (!touched.length) process.exit(0)

const labels = (process.env.PR_LABELS || '').split(',').map((s) => s.trim())
const marked = labels.includes('no-changelog') || git('log', '--format=%B', `${base}..HEAD`).includes('[no-changelog]')
if (marked) process.exit(0)

const diff = git('diff', `${base}...HEAD`, '--', 'CHANGELOG.md')
const unreleased = git('show', 'HEAD:CHANGELOG.md').match(/## Unreleased\n([\s\S]*?)(?=\n## \d)/)?.[1] ?? ''
const added = diff.split('\n').filter((l) => l.startsWith('+- ') || l.startsWith('+  '))
if (added.length && unreleased.trim()) process.exit(0)

console.error(`CHANGELOG.md: this branch changes what ships (${touched.slice(0, 3).join(', ')}${touched.length > 3 ? ', …' : ''})
but adds no line under "## Unreleased". Add one in plain words, or mark the
change as one nobody notices: the no-changelog label on the pull request, or
"[no-changelog]" in a commit message.`)
process.exit(1)
