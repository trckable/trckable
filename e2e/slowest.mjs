// A Playwright reporter: the slowest tests and every retry, printed at the end
// of a run and added to the job summary on GitHub. A slow browser shows here
// without anyone opening a trace.
import { appendFileSync } from 'node:fs'

const TOP = 10

export default class Slowest {
  tests = new Map()

  onTestEnd(test, result) {
    const t = this.tests.get(test.id) ?? { title: test.titlePath().slice(1).join(' › '), ms: 0, tries: 0, statuses: [] }
    t.ms += result.duration
    t.tries++
    t.statuses.push(result.status)
    this.tests.set(test.id, t)
  }

  onEnd(result) {
    const all = [...this.tests.values()]
    if (all.length === 0) return // a listing, not a run
    const slowest = all.sort((a, b) => b.ms - a.ms).slice(0, TOP)
    const retried = all.filter((t) => t.tries > 1)
    const row = (t) => `${(t.ms / 1000).toFixed(1).padStart(6)} s  ${t.title}${t.tries > 1 ? `  (${t.statuses.join(', ')})` : ''}`
    const lines = [`\nSlowest ${slowest.length} tests (all tries added):`, ...slowest.map(row)]
    if (retried.length) lines.push(`\nRetried (${retried.length}):`, ...retried.map(row))
    if (result.status === 'timedout') lines.push('\nThe run hit its time limit.')
    console.log(lines.join('\n'))
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + lines.join('\n') + '\n```\n')
  }

  printsToStdio() {
    return false
  }
}
