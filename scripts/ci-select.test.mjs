import { test } from 'node:test'
import assert from 'node:assert/strict'
import { everything, outputs, select } from './ci-select.mjs'

const out = (...files) => outputs(select(files))

test('prose runs nothing heavy', () => {
  const o = out('README.md', 'docs/x.md', '.github/images/readme/a.png')
  assert.equal(o.code, 'false')
  assert.equal(o.e2e, '')
  assert.equal(o.server_pkgs, '')
})

test('the WordPress plugin runs nothing here: it has its own workflow', () => {
  const o = out('integrations/wordpress/trckable/trckable.php', 'e2e/wordpress/smoke.spec.ts')
  assert.equal(o.code, 'false')
  assert.equal(o.e2e, '')
  assert.equal(o.full, 'false')
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

const jobs = (o, key = 'browsers') => JSON.parse(o[key]).map((j) => `${j.name}:${j.specs}`)

test('a pull request runs WebKit on the key specs and the changed ones, in one job', () => {
  const o = out('dashboard/src/features/notes/N.tsx')
  assert.deepEqual(jobs(o), [
    'chromium:chart-hover notes',
    'firefox:chart-hover notes',
    'webkit:chart-hover cookieless install journey landing live methods notes onboarding switcher tracking',
  ])
  assert.deepEqual(jobs(o, 'demo_browsers'), ['chromium:all'])
  // Every spec on the other two; the key specs only on WebKit.
  const wide = out('dashboard/src/styles.css')
  assert.deepEqual(jobs(wide).slice(0, 2), ['chromium:all', 'firefox:all'])
  assert.equal(JSON.parse(wide.browsers)[2].specs, 'chart-hover cookieless install journey landing live methods onboarding switcher tracking')
  assert.equal(wide.full, 'false')
})

test('main, a release and the nightly run put the whole suite on WebKit, in shards', () => {
  const o = outputs(everything())
  assert.equal(o.full, 'true')
  assert.deepEqual(jobs(o), ['chromium:all', 'firefox:all', 'webkit 1/3:all', 'webkit 2/3:all', 'webkit 3/3:all'])
  assert.deepEqual(jobs(o, 'demo_browsers'), ['chromium:all', 'firefox:all', 'webkit 1/2:all', 'webkit 2/2:all'])
  assert.deepEqual(JSON.parse(o.browsers).filter((j) => j.browser === 'webkit').map((j) => j.shard), ['1/3', '2/3', '3/3'])
})

test('a version bump, or a file nothing knows, cannot skip the whole WebKit suite', () => {
  for (const f of ['VERSION', 'CHANGELOG.md.new', 'dashboard/src/features/notes/N.tsx']) {
    const o = out(f, 'VERSION')
    assert.equal(o.full, 'true', f)
    assert.ok(jobs(o).includes('webkit 1/3:all'), f)
  }
})

test('nothing to run: the matrices still parse', () => {
  const o = out('README.md')
  assert.equal(o.e2e, '')
  assert.equal(JSON.parse(o.browsers).length, 1)
  assert.equal(JSON.parse(o.demo_browsers).length, 1)
})

test('the accuracy suite runs when what it measures changes, and not for a screen', () => {
  assert.equal(out('tracker/src/core.ts').accuracy, 'true')
  assert.equal(out('tracker/test/core.test.ts').accuracy, 'false')
  assert.equal(out('packages/trckable/src/server.ts').accuracy, 'true')
  assert.equal(out('packages/trckable/test/server.test.ts').accuracy, 'false')
  assert.equal(out('server/internal/writer/sessions.go').accuracy, 'true')
  assert.equal(out('server/internal/writer/writer_test.go').accuracy, 'false')
  assert.equal(out('e2e/accuracy/harness.ts').accuracy, 'true')
  assert.equal(out('e2e/accuracy/harness.ts').e2e, '') // its own jobs, not the suite's browser specs
  assert.equal(out('dashboard/src/features/journey/Journey.tsx').accuracy, 'false')
  assert.equal(out('README.md').accuracy, 'false')
  assert.equal(outputs(everything()).accuracy, 'true')
})
