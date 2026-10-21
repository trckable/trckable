// A paused uptime check reads the same on Live and in the Briefing, and a paused day is neither green nor red.
import { describe, expect, it } from 'vitest'
import { dayStates } from '../../features/incidents/model'
import { uptimeScore } from '../briefing/model'
import { pausedWords, uptimeFigure } from './health'

const DAY = 86400
const now = Date.parse('2026-10-20T12:00:00Z') / 1000
const watched = now - 40 * DAY

describe('a paused check', () => {
  it('is said in the Briefing’s words on Live', () => {
    expect(pausedWords).toBe(uptimeScore({ pct: 100, downNow: false, downMin: 0, off: false, paused: true }).words)
  })

  it('paints its days paused in Live’s strip, and a day with an incident stays an incident', () => {
    const paused = [{ from: now - 3 * DAY, to: now - 1 * DAY }]
    const down = [{ id: 'i', site: 's', kind: 'down' as const, started_at: now - 2 * DAY, ended_at: now - 2 * DAY + 600, cause: '', note: '', expected_visits: null }]
    const fig = uptimeFigure(down as never, '2026-10-20', 'UTC', now, watched, 2 * DAY, paused)
    expect(fig?.days.slice(-5)).toEqual(['ok', 'paused', 'down', 'paused', 'ok'])
    expect(fig?.days.filter((d) => d === 'paused')).toHaveLength(2)
  })

  it('leaves the paused time out of the share, and says nothing when all of it was paused', () => {
    expect(uptimeFigure([], '2026-10-20', 'UTC', now, watched, now - watched, [{ from: watched, to: now }])?.pct).toBeNull()
  })

  it('is the incidents strip’s state too: one function paints both', () => {
    const states = dayStates([], ['2026-10-18', '2026-10-19'], 'UTC', now, watched, [{ from: Date.parse('2026-10-19T03:00:00Z') / 1000, to: now }])
    expect([...states.values()]).toEqual(['ok', 'paused'])
  })
})
