import { test } from 'node:test'
import assert from 'node:assert/strict'
import { outputs, select } from './ci-select.mjs'

const out = (...files) => outputs(select(files))

test('prose runs nothing heavy', () => {
  const o = out('README.md', 'docs/x.md', '.github/images/readme/a.png')
  assert.equal(o.code, 'false')
  assert.equal(o.e2e, '')
  assert.equal(o.server_pkgs, '')
})

test('a dashboard feature runs its specs, the accessibility pass and the dashboard job', () => {
  const o = out('dashboard/src/features/journey/Journey.tsx', 'server/internal/web/dist/assets/index.js')
  assert.equal(o.e2e, 'journey')
  assert.equal(o.demo, 'true')
  assert.equal(o.dashboard, 'true')
  assert.equal(o.server_pkgs, '') // the embedded build is not a server change
  assert.equal(o.race, 'false')
  assert.equal(o.crash, 'false')
  assert.equal(o.full, 'false')
})

test('fullcharts goes to the demo job', () => {
  const o = out('dashboard/src/features/fullcharts/Grid.tsx')
  assert.equal(o.e2e, '')
  assert.equal(o.demo, 'true')
})

test('an unmapped dashboard file runs every spec', () => {
  assert.equal(out('dashboard/src/styles.css').e2e, 'all')
  assert.equal(out('dashboard/package.json').e2e, 'all')
})

test('a dashboard unit test runs only the dashboard job', () => {
  const o = out('dashboard/src/lib/dates.test.ts')
  assert.equal(o.dashboard, 'true')
  assert.equal(o.e2e, '')
  assert.equal(o.demo, 'false')
})

test('Go: a test file runs its package with race; code runs everything that depends on it', () => {
  let o = out('server/internal/query/query_test.go')
  assert.equal(o.server_pkgs, './internal/query')
  assert.equal(o.race, 'true')
  assert.equal(o.e2e, '')
  assert.equal(o.crash, 'false')
  o = out('server/internal/query/query.go')
  assert.equal(o.server_pkgs, './internal/query')
  assert.equal(o.crash, 'true')
  assert.equal(o.e2e, 'all')
  assert.equal(out('server/go.sum').server_pkgs, 'all')
  assert.equal(out('server/bench/crashtest/main.go').crash, 'true')
})

test('tracker, npm package, specs and the Dockerfile', () => {
  assert.equal(out('tracker/src/t.ts').e2e, 'all')
  assert.equal(out('tracker/src/t.ts').tracker, 'true')
  assert.equal(out('packages/trckable/src/next.ts').e2e, 'landing methods')
  assert.equal(out('e2e/tests/notes.spec.ts').e2e, 'notes')
  assert.equal(out('e2e/tests/a11y.spec.ts').demo, 'true')
  assert.equal(out('e2e/playwright.config.ts').full, 'true')
  const d = out('deploy/Dockerfile')
  assert.equal(d.image, 'true')
  assert.equal(d.e2e, '')
})

test('anything unknown runs everything', () => {
  for (const f of ['.github/workflows/ci.yml', 'pnpm-lock.yaml', 'scripts/facts.mjs', 'something/new.txt']) {
    const o = out('dashboard/src/features/notes/N.tsx', f)
    assert.equal(o.full, 'true', f)
    assert.equal(o.e2e, 'all', f)
    assert.equal(o.server_pkgs, 'all', f)
  }
})

test('the release scripts are tested by the selection job itself', () => {
  assert.equal(out('scripts/release.mjs', 'scripts/ci-select.test.mjs').code, 'false')
})
