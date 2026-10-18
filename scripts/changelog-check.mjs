// Every change people will notice carries its own note, a new file
// changes/<slug>.md holding one line, in the same pull request. A file per
// change (instead of a line in CHANGELOG.md) means two pull requests never
// touch the same lines; pnpm release compiles them. Written at the end, a release's
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

const added = git('diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', 'changes')
  .split('\n')
  .filter((f) => /^changes\/[^/]+\.md$/.test(f) && f !== 'changes/README.md')
if (added.length) process.exit(0)

console.error(`CHANGELOG.md: this branch changes what ships (${touched.slice(0, 3).join(', ')}${touched.length > 3 ? ', …' : ''})
but adds no changes/<slug>.md note. Add one line in plain words (see
changes/README.md), or mark the
change as one nobody notices: the no-changelog label on the pull request, or
"[no-changelog]" in a commit message.`)
process.exit(1)
