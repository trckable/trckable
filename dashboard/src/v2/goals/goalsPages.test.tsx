// @vitest-environment happy-dom
// The Goals tab: the list of goals with what stands out, a row opening that goal's own page, and a goal's page with each time it happened.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ goalList: vi.fn(), goalPage: vi.fn(), setGoalQuiet: vi.fn() }))
vi.mock('../../lib/apiMore', async (orig) => ({ ...(await orig<typeof import('../../lib/apiMore')>()), more: api }))
const setView = vi.hoisted(() => vi.fn())
vi.mock('../../lib/url', async (orig) => ({ ...(await orig<typeof import('../../lib/url')>()), setView }))
let funnel: { goalsOn: boolean; pages: unknown[]; goals: unknown[] } = { goalsOn: true, pages: [], goals: [] }
vi.mock('../explore/data/useExplore', () => ({ useTab: () => ({ state: 'ok', data: funnel }) }))

import { setRole } from '../../lib/me'
import type { XCtx } from '../explore/ctx'
import { GoalsPage } from './GoalsPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const ctx = (xg?: string) => ({ site: { id: 's1', domain: 'site.com', timezone: 'UTC' }, view: { xg, period: '7d' }, query: { from: '2026-11-18', to: '2026-11-24' }, connect: vi.fn(), data: {}, tabName: 'Goals' }) as unknown as XCtx

const list = {
  goals: [
    { goal: 'newsletter', name: 'Newsletter', count: 9, out: true, why: 'first', usual: 0, spark: [0, 0, 9] },
    { goal: 'app_download', name: 'App download', count: 6, out: true, why: 'times', factor: 3, usual: 2, spark: [1, 2, 3] },
    { goal: 'login_prompted', name: 'Login prompted', count: 31, out: false, usual: 5, spark: [4, 5, 5] },
  ],
  reached: 46,
  out: 2,
  days: 7,
  source: 'google.com',
  source_share: 0.44,
}

beforeEach(() => {
  api.goalList.mockReset().mockResolvedValue(list)
  api.goalPage.mockReset()
  api.setGoalQuiet.mockReset().mockResolvedValue(undefined)
  setView.mockReset()
  funnel = { goalsOn: true, pages: [], goals: [] }
  setRole('owner')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the goals list', () => {
  it('lists each goal with its count, what it is against a usual day, and marks those that stand out', async () => {
    act(() => root.render(<GoalsPage x={ctx()} />))
    await settle()
    const rows = [...host.querySelectorAll('.gl-row')]
    expect(rows.map((r) => r.querySelector('.gl-name')?.textContent)).toEqual(['Newsletter', 'App download', 'Login prompted'])
    expect(rows.map((r) => r.querySelector('.gl-vs')?.textContent)).toEqual(['New', '↑ 3×', 'as usual'])
    expect(rows.map((r) => r.classList.contains('out'))).toEqual([true, true, false])
    expect(host.textContent).toContain('Newsletter, App download')
  })

  it('opens a goal’s own page from its row: the address names the goal', async () => {
    act(() => root.render(<GoalsPage x={ctx()} />))
    await settle()
    act(() => (host.querySelectorAll('.gl-row')[1] as HTMLButtonElement).click())
    expect(setView).toHaveBeenCalledWith({ xg: 'app_download' })
  })

  it('shows a name that is long in one line, cut, with the full name as its title', async () => {
    const long = 'A very long goal name that goes on and on past any column a table could give it'
    api.goalList.mockResolvedValue({ ...list, goals: [{ ...list.goals[0], goal: 'long', name: long }] })
    act(() => root.render(<GoalsPage x={ctx()} />))
    await settle()
    expect(host.querySelector('.gl-name')?.getAttribute('title')).toBe(long)
  })

  it('asks to set goals up when the site counts none', async () => {
    funnel = { goalsOn: false, pages: [], goals: [] }
    api.goalList.mockResolvedValue({ ...list, goals: [], reached: 0, out: 0 })
    const x = ctx()
    act(() => root.render(<GoalsPage x={x} />))
    await settle()
    expect(host.querySelector('.gl-row')).toBeNull()
    const go = [...host.querySelectorAll('button')].find((b) => !/how/i.test(b.textContent ?? ''))
    act(() => go?.click())
    expect(x.connect).toHaveBeenCalledWith('goals')
  })

  it('says so when no goal was reached in the period', async () => {
    api.goalList.mockResolvedValue({ ...list, goals: [], reached: 0, out: 0 })
    act(() => root.render(<GoalsPage x={ctx()} />))
    await settle()
    expect(host.textContent).toContain('No goal was reached in this period.')
  })
})

describe('a goal’s page', () => {
  const page = {
    goal: list.goals[1],
    events: [
      { at: 1_795_000_000, path: '/planner', source: 'google.com', country: 'DE', device: 'mobile', os: 'iOS' },
      { at: 1_794_990_000, path: '/', source: '', country: 'AT', device: 'desktop', os: 'macOS' },
    ],
    sources: [{ source: 'google.com', count: 4 }],
    paths: [{ source: '/planner', count: 3 }, { source: '/', count: 1 }],
    days: 7,
    quiet: false,
  }

  it('names the goal, why it stands out, and each time it happened', async () => {
    api.goalPage.mockResolvedValue(page)
    act(() => root.render(<GoalsPage x={ctx('app_download')} />))
    await settle()
    expect(api.goalPage).toHaveBeenCalledWith('s1', 'app_download', { from: '2026-11-18', to: '2026-11-24' }, expect.anything())
    expect(host.querySelector('h2')?.textContent).toBe('App download')
    expect(host.textContent).toContain('3× a usual day (a usual day is 2).')
    expect(host.querySelectorAll('.gs-time')).toHaveLength(2)
    expect(host.querySelectorAll('.gs-time')[0].textContent).toContain('/planner')
    expect(host.querySelectorAll('.gs-time')[0].textContent).toContain('Germany')
    expect(host.querySelectorAll('.gs-time')[1].textContent).toContain('Direct')
    // Beside the times: who sent them, and the pages.
    expect([...host.querySelectorAll('.gs-top .gs-h')].map((h) => h.textContent)).toEqual(['Came from', 'On page'])
    expect([...host.querySelectorAll('.gs-top')[1].querySelectorAll('.gs-top-row')].map((r) => r.textContent)).toEqual(['/planner3', '/1'])
  })

  it('says As usual. for a goal that does not stand out', async () => {
    api.goalPage.mockResolvedValue({ ...page, goal: list.goals[2] })
    act(() => root.render(<GoalsPage x={ctx('login_prompted')} />))
    await settle()
    expect(host.querySelector('.gs-why')?.textContent).toBe('As usual.')
  })

  it('leads back to the list', async () => {
    api.goalPage.mockResolvedValue(page)
    act(() => root.render(<GoalsPage x={ctx('app_download')} />))
    await settle()
    act(() => (host.querySelector('.gp-back') as HTMLButtonElement).click())
    expect(setView).toHaveBeenCalledWith({ xg: undefined })
  })

  it('keeps a goal to the bell only when it stands out, on a tap', async () => {
    api.goalPage.mockResolvedValue(page)
    act(() => root.render(<GoalsPage x={ctx('app_download')} />))
    await settle()
    const quiet = host.querySelector('.gs-quiet') as HTMLButtonElement
    expect(quiet.getAttribute('aria-pressed')).toBe('false')
    await act(async () => {
      quiet.click()
      await Promise.resolve()
    })
    expect(api.setGoalQuiet).toHaveBeenCalledWith('s1', 'app_download', true)
    expect(quiet.getAttribute('aria-pressed')).toBe('true')
    expect(quiet.textContent).toBe('You hear of it only when it stands out')
  })
})
