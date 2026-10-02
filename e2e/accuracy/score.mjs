// The accuracy score, per browser: every scenario, whether it matched exactly,
// and every number it checked. Written to results/accuracy-<project>.json for
// scripts/accuracy-score.mjs, which publishes the totals as CI facts.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export default class Score {
  runs = []

  onTestEnd(test, result) {
    if (result.status === 'skipped') return
    const note = (type) => test.annotations.filter((a) => a.type === type).map((a) => a.description)
    const checks = note('accuracy').flatMap((d) => JSON.parse(d))
    this.runs.push({
      scenario: test.title,
      file: test.location.file.split('/').pop().replace(/\.spec\.ts$/, ''),
      project: test.parent.project()?.name ?? '',
      kind: note('kind')[0] ?? 'browser',
      exact: result.status === 'passed' && checks.every((c) => c.ok),
      status: result.status,
      checks,
      ms: result.duration,
    })
  }

  onEnd() {
    const dir = process.env.ACCURACY_OUT || join(HERE, 'results')
    mkdirSync(dir, { recursive: true })
    for (const project of new Set(this.runs.map((r) => r.project))) {
      const runs = this.runs.filter((r) => r.project === project)
      writeFileSync(join(dir, `accuracy-${project}.json`), JSON.stringify({ project, runs }, null, 2) + '\n')
      const exact = runs.filter((r) => r.exact).length
      console.log(`accuracy ${project}: ${exact}/${runs.length} scenarios exact`)
    }
  }
}
