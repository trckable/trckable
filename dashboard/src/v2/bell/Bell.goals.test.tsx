// @vitest-environment happy-dom
// A day's goals is one card in the bell: what stands out first and why, what was as usual after, a goal's times when it is
// tapped, and the two things to do with it.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import * as more from '../../lib/apiMore'
import { setRole } from '../../lib/me'
import * as url from '../../lib/url'
import type { FeedGoal } from './feed'
import { dayOf } from './days'
import { fromFeed, type Notice } from './notices'
import { Bell } from './Bell'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 's1', domain: 'a.com', timezone: 'UTC' } as Site
const now = Math.floor(Date.now() / 1000)
const day = dayOf(now, 'UTC')
const goals: FeedGoal[] = [
  { goal: 'nudge', name: 'Nudge login clicked', count: 2, last: now - 600, out: true, why: 'first' },
  { goal: 'download', name: 'App download', count: 1, last: now - 300, out: true, why: 'times', factor: 5, usual: 0.2 },
  { goal: 'prompted', name: 'Login prompted', count: 4, last: now - 4000, usual: 5 },
  { goal: 'outbound', name: 'Outbound clicks', count: 2, last: now - 5000, usual: 3 },
]
const goalPage = (g: FeedGoal) => ({
  goal: { goal: g.goal, name: g.name ?? g.goal, count: g.count, out: !!g.out, why: g.why, factor: g.factor, usual: g.usual ?? 0, spark: [] },
  events: [{ at: now - 600, path: '/planner', source: 'google.com', country: 'DE', device: 'mobile', os: 'iOS' }],
  sources: [{ source: 'google.com', count: g.count }],
  days: 1,
  quiet: false,
})

function mount() {
  const items: Notice[] = fromFeed([{ id: `goal:s1:${day}:4`, kind: 'goal', site: 's1', at: now - 300, day, count: 9, goals }], [site], now)
  const notices = { items, read: new Set<string>(), refresh: vi.fn(), mark: vi.fn(), markAll: () => undefined, can: true, ready: true, sites: [site], dismiss: undefined, archive: undefined }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Bell site={site} notices={notices as never} />))
  act(() => host.querySelector<HTMLButtonElement>('#bellBtn')?.click())
  return { host, notices, stop: () => act(() => root.unmount()) }
}
const card = () => document.querySelector('.gs-card')

beforeEach(() => {
  setRole('owner')
  vi.spyOn(more.more, 'goalPage').mockImplementation((_s, goal) => Promise.resolve(goalPage(goals.find((g) => g.goal === goal) as FeedGoal)))
  vi.spyOn(more.more, 'setGoalQuiet').mockResolvedValue()
})
afterEach(() => {
  vi.restoreAllMocks()
  setRole()
  document.body.innerHTML = ''
})

describe('the goals card', () => {
  it('is one row: how many goals were reached, and how many stand out', () => {
    const m = mount()
    expect(m.host.querySelectorAll('.nf')).toHaveLength(1)
    expect(m.host.querySelector('.nf .nft b')?.textContent).toBe('9 goals reached today')
    expect(m.host.querySelector('.nf .nft small')?.textContent).toBe('2 stand out. The rest is a normal day.')
    m.stop()
  })

  it('lists what stands out with its reason, then what was as usual, and reads the row', async () => {
    const m = mount()
    act(() => m.host.querySelector<HTMLButtonElement>('.nf')?.click())
    await vi.waitFor(() => expect(card()).not.toBeNull(), { timeout: 5000 })
    expect(m.notices.mark).toHaveBeenCalled()
    const heads = [...document.querySelectorAll('.gs-sec')].map((h) => h.textContent)
    expect(heads).toEqual(['Stands out', 'As usual'])
    const picks = [...document.querySelectorAll('.gs-pick')]
    expect(picks.map((p) => p.querySelector('.gs-pick-name')?.textContent)).toEqual(['Nudge login clicked', 'App download', 'Login prompted', 'Outbound clicks'])
    expect(picks.slice(0, 2).map((p) => p.querySelector('.gs-pick-why')?.textContent)).toEqual(['First time ever', '5× a usual day'])
    expect(picks[2].querySelector('.gs-pick-why')).toBeNull()
    expect(picks[2].querySelector('.gs-pick-last')?.textContent).toMatch(/^last \d\d:\d\d$/)
    m.stop()
  })

  it('shows each time a goal happened when it is tapped, and Open in Goals leads to that goal’s page', async () => {
    const set = vi.spyOn(url, 'setView').mockImplementation(() => undefined)
    const m = mount()
    act(() => m.host.querySelector<HTMLButtonElement>('.nf')?.click())
    await vi.waitFor(() => expect(card()).not.toBeNull(), { timeout: 5000 })
    act(() => document.querySelectorAll<HTMLButtonElement>('.gs-pick')[1].click())
    await vi.waitFor(() => expect(document.querySelectorAll('.gs-time')).toHaveLength(1), { timeout: 5000 })
    expect(document.querySelector('.gs-detail-head')?.textContent).toBe('App download')
    expect(document.querySelector('.gs-time')?.textContent).toContain('/planner')
    expect(document.querySelector('.gs-why')?.textContent).toBe('5× a usual day (a usual day is 0.2).')
    act(() => document.querySelector<HTMLButtonElement>('.gs-open')?.click())
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ xp: 'goals', xg: 'download', period: 'today' }))
    m.stop()
  })

  it('offers to be told only when a goal stands out, and says it is kept', async () => {
    const m = mount()
    act(() => m.host.querySelector<HTMLButtonElement>('.nf')?.click())
    await vi.waitFor(() => expect(card()).not.toBeNull(), { timeout: 5000 })
    await vi.waitFor(() => expect(document.querySelector('.gs-quiet')).not.toBeNull(), { timeout: 5000 })
    const quiet = document.querySelector<HTMLButtonElement>('.gs-quiet') as HTMLButtonElement
    expect(quiet.textContent).toBe('Only tell me when it stands out')
    await act(async () => {
      quiet.click()
      await Promise.resolve()
    })
    expect(more.more.setGoalQuiet).toHaveBeenCalledWith('s1', 'nudge', true)
    expect(quiet.textContent).toBe('You hear of it only when it stands out')
    m.stop()
  })

  it('opens the list of goals for the day from its foot', async () => {
    const set = vi.spyOn(url, 'setView').mockImplementation(() => undefined)
    const m = mount()
    act(() => m.host.querySelector<HTMLButtonElement>('.nf')?.click())
    await vi.waitFor(() => expect(card()).not.toBeNull(), { timeout: 5000 })
    act(() => document.querySelector<HTMLButtonElement>('.gs-all')?.click())
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ xp: 'goals', xg: undefined }))
    m.stop()
  })
})
