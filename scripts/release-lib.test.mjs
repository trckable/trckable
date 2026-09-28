import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bump, checksState, cutChangelog, duration, newer, releaseDate, timings, versionMismatches } from './release-lib.mjs'

test('newer compares each part as a number', () => {
  assert.equal(newer('0.10.0', '0.9.9'), true)
  assert.equal(newer('0.4.1', '0.4.1'), false)
  assert.equal(newer('0.4.0', '0.4.1'), false)
  assert.equal(newer('1.0.0', '0.99.99'), true)
})

test('bump moves the version where it lives, and refuses a place without the old one', () => {
  assert.equal(bump('server/internal/server/server.go', 'var Version = "0.4.0"\n', '0.4.0', '0.4.1'), 'var Version = "0.4.1"\n')
  assert.equal(bump('README.md', '![v](badge/version-0.4.0-blue)', '0.4.0', '0.4.1'), '![v](badge/version-0.4.1-blue)')
  assert.throws(() => bump('tracker/package.json', '"version": "0.3.0"', '0.4.0', '0.4.1'), /nothing to change/)
  assert.throws(() => bump('other.txt', '', '0.4.0', '0.4.1'), /does not carry/)
})

test('versionMismatches names every place that disagrees', () => {
  const files = {
    'tracker/package.json': '"version": "0.4.1"',
    'packages/trckable/package.json': '"version": "0.4.1"',
    'server/internal/server/server.go': 'var Version = "0.4.1"',
    'README.md': 'badge/version-0.4.1-',
    'CHANGELOG.md': '## Unreleased\n\n## 0.4.1 (27 Sep 2026)\n- a\n',
  }
  assert.deepEqual(versionMismatches('0.4.1', (f) => files[f]), [])
  assert.deepEqual(versionMismatches('0.4.2', (f) => files[f]), [
    'tracker/package.json', 'packages/trckable/package.json', 'server/internal/server/server.go', 'README.md', 'CHANGELOG.md',
  ])
  // 0.4.1 must not pass on a section for 0.4.10
  assert.deepEqual(versionMismatches('0.4.1', (f) => (f === 'CHANGELOG.md' ? '## 0.4.10 (1 Oct 2026)\n' : files[f])), ['CHANGELOG.md'])
})

test('cutChangelog turns Unreleased into the release, with a fresh Unreleased above', () => {
  const { log, body } = cutChangelog('# Changelog\n\n## Unreleased\n\n- a fix\n\n## 0.4.0 (27 Sep 2026)\n- old\n', '0.4.1', '28 Sep 2026')
  assert.equal(body, '- a fix')
  assert.equal(log, '# Changelog\n\n## Unreleased\n\n## 0.4.1 (28 Sep 2026)\n\n- a fix\n\n## 0.4.0 (27 Sep 2026)\n- old\n')
  assert.throws(() => cutChangelog('## Unreleased\n\n## 0.4.0 (x)\n', '0.4.1', 'd'), /empty/)
})

test('releaseDate is UTC', () => {
  assert.equal(releaseDate(new Date('2026-09-24T23:30:00-02:00')), '25 Sep 2026')
})

test('duration and timings', () => {
  assert.equal(duration(9.4), '9s')
  assert.equal(duration(75), '1m 15s')
  const t = timings([{ name: 'prepare', seconds: 60 }, { name: 'checks', seconds: 300 }])
  assert.match(t, /prepare\s+1m 00s/)
  assert.match(t, /total\s+6m 00s/)
})

test('checksState waits for every required check and stops at the first failure', () => {
  const req = ['server', 'cla']
  assert.equal(checksState([], req), 'pending')
  assert.equal(checksState([{ name: 'cla', bucket: 'pass' }], req), 'pending') // server not started yet
  assert.equal(checksState([{ name: 'cla', bucket: 'pass' }, { name: 'server', bucket: 'pending' }], req), 'pending')
  assert.equal(checksState([{ name: 'cla', bucket: 'pass' }, { name: 'server', bucket: 'skipping' }], req), 'pass')
  assert.equal(checksState([{ name: 'cla', bucket: 'pass' }, { name: 'server', bucket: 'pass' }, { name: 'extra', bucket: 'pending' }], req), 'pending')
  assert.equal(checksState([{ name: 'extra', bucket: 'fail' }, { name: 'server', bucket: 'pending' }], req), 'fail')
  assert.equal(checksState([{ name: 'cla', bucket: 'cancel' }], req), 'fail')
})
