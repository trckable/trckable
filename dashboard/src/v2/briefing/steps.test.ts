// The Briefing's connect cards: each thing not set up yet shows its one button, and only for someone who may change it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Result, Site } from '../../lib/api'

const openSettings = vi.fn<(...a: unknown[]) => void>()
vi.mock('../../lib/settings', () => ({ openSettings: (...a: unknown[]) => openSettings(...a) }))

import { nudge, setupRows } from './steps'

const site = { id: 's1', domain: 'site.com' } as Site
const bare = { goals: [] } as unknown as Result
const onGoal = vi.fn()
const rows = (o: Partial<Parameters<typeof setupRows>[0]> = {}) => setupRows({ site, cur: bare, can: true, shared: false, noSearch: true, noAlerts: true, want: () => true, onGoal, ...o })

beforeEach(() => {
  openSettings.mockReset()
  onGoal.mockReset()
})

describe('what the Briefing offers to connect', () => {
  it('a new site gets revenue, search, goals and alerts, in that order', () => {
    expect(rows().map((r) => r.key)).toEqual(['rev', 'search', 'goals', 'alerts'])
  })

  it('each button opens the right place', () => {
    const by = Object.fromEntries(rows().map((r) => [r.key, r]))
    by.rev.act?.()
    by.search.act?.()
    by.alerts.act?.()
    by.goals.act?.()
    expect(openSettings.mock.calls.map((c) => c[1])).toEqual(['payments', 'search', 'alerts'])
    expect(onGoal).toHaveBeenCalledTimes(1)
  })

  it('what is connected is not offered again', () => {
    const cur = { money: {}, goals: [{ name: 'signup' }] } as unknown as Result
    const left = rows({ cur, noSearch: false, noAlerts: false, site: { ...site, watched_since: 1 } })
    expect(left).toEqual([])
  })

  it('someone who cannot change settings sees the same cards with no button to press', () => {
    const viewer = rows({ can: false })
    expect(viewer.map((r) => r.key)).toEqual(rows().map((r) => r.key))
    expect(viewer.every((r) => r.act === undefined)).toBe(true)
  })

  it('a shared link is offered nothing', () => {
    expect(rows({ can: false, shared: true })).toEqual([])
  })
})

describe('one nudge at a time', () => {
  const all = { site, cur: bare, can: true, shared: false, noSearch: true, noAlerts: true, want: () => true, onGoal, stories: [], top: null, downNow: false }
  it('shows the first thing not set up, and only that', () => {
    expect(nudge(all).setups).toHaveLength(1)
    expect(nudge(all).act).toBeNull()
  })
  it('puts what is worth doing now before a setup', () => {
    const n = nudge({ ...all, downNow: true })
    expect(n.setups).toEqual([])
    expect(n.act).not.toBeNull()
  })
  it('shows nothing on a shared page', () => {
    expect(nudge({ ...all, shared: true })).toEqual({ setups: [], act: null })
  })
})
