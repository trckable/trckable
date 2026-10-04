// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setView = vi.fn<(patch: unknown) => void>()
vi.mock('../../lib/url', () => ({ setView: (p: unknown) => setView(p) }))
vi.mock('../../components/Toast', () => ({ toast: vi.fn() }))

import SurgeCard from './SurgeCard'
import { pref } from './prefs'
import { clock, startSlice, storyLines, surgeFilter, surgeLines, surgeNotice, surgeNow, type Story, type Surge } from './surge'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const story: Story = {
  at: 1_791_000_000,
  series: [18, 22, 19, 21, 20, 23, 19, 22, 40, 53, 49, 31],
  step: 5,
  start: 1_791_000_000 - 20 * 60,
  peak: 53,
  peak_at: 1_791_000_000 - 15 * 60,
  now: 31,
  mobile: 30,
  devices: 40,
  countries: [{ country: 'AL', n: 20 }, { country: 'US', n: 8 }],
}

const surge: Surge = {
  id: 'surge_1',
  started: 1_791_000_000,
  online: 53,
  usual: 20,
  times: 2.7,
  why: { source: 'Facebook', source_dim: 'referrer', source_value: 'l.facebook.com', source_n: 34, source_usual: 2, page: '/blog/launch-post', page_n: 30, before: 20, minutes: 15 },
  story,
}

describe('what the card says', () => {
  it('writes the headline, the source with its usual, the page and the jump, all counted', () => {
    expect(surgeNow(surge)).toBe('53 people on your site right now, about 2.7× usual.')
    expect(surgeLines(surge)).toEqual([
      '34 of them came from Facebook (usually about 2).',
      'Most of them are reading /blog/launch-post.',
      'From 20 to 53 in 15 minutes.',
    ])
  })
  it('says nothing it did not count: no source, no page, no jump that is not one', () => {
    const bare: Surge = { ...surge, why: { source_usual: 0, before: 60, minutes: 15 } }
    expect(surgeLines(bare)).toEqual([])
    expect(surgeLines({ ...surge, why: { ...surge.why, source: 'Direct', source_dim: 'channel', source_value: 'Direct', source_usual: 0.2 } })[0]).toBe('34 of them came straight to the site (usually next to none).')
  })
  it('filters to the source, and to nothing when there is none', () => {
    expect(surgeFilter(surge)).toEqual({ dim: 'referrer', value: 'l.facebook.com' })
    expect(surgeFilter({ ...surge, why: { source_usual: 0, before: 0, minutes: 15 } })).toBeNull()
  })
  it('puts "mostly" in the notice only when the source has most of them, and one emoji at most', () => {
    expect(surgeNotice(surge, 'a.com').title).toBe('53 people on your site right now, mostly from Facebook 🎉')
    expect(surgeNotice({ ...surge, why: { ...surge.why, source_n: 20 } }, 'a.com').title).toBe('53 people on your site right now 🎉')
  })
})

describe('the story', () => {
  it('tells when it began and from where as "looks like", the peak and now, the phones and the countries', () => {
    const lines = storyLines(surge, 'UTC', (c) => ({ AL: 'Albania', US: 'United States' })[c] ?? c)
    expect(lines[0]).toBe(`Looks like a link on Facebook, landing on /blog/launch-post, started sending people around ${clock(story.start ?? 0, 'UTC')} (the exact post isn’t visible).`)
    expect(lines[1]).toBe(`Peaked at 53 at ${clock(story.peak_at, 'UTC')}, 31 now.`)
    expect(lines.slice(2)).toEqual(['75% on phones.', 'Top countries: Albania 20, United States 8.'])
  })
  it('says it has been busy longer when the climb began before the hour, and skips a split that is not clear', () => {
    const lines = storyLines({ ...surge, story: { ...story, start: undefined, mobile: 21, devices: 40 } }, 'UTC', (c) => c)
    expect(lines[0]).toBe('It has been busy for more than an hour.')
    expect(lines.some((l) => l.includes('phones') || l.includes('computers'))).toBe(false)
  })
  it('marks the slice the climb began in', () => {
    expect(startSlice(story)).toBe(8)
    expect(startSlice({ ...story, start: undefined })).toBeUndefined()
  })
})

let root: Root
let host: HTMLDivElement
const answer = (s: Surge | null) =>
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ surge: s }) }))
const draw = async () => {
  await act(() => {
    root.render(<SurgeCard site={{ id: 'tkb_x', domain: 'a.com', timezone: 'UTC' }} />)
    return Promise.resolve()
  })
  await act(() => Promise.resolve())
  await act(() => Promise.resolve())
}
const card = () => document.body.querySelector('.side-card')

beforeEach(() => {
  localStorage.clear()
  setView.mockClear()
  vi.stubGlobal('Notification', Object.assign(function Notification() {}, { permission: 'default', requestPermission: () => Promise.resolve('granted') }))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('the surge card', () => {
  it('is not there when no surge is on', async () => {
    answer(null)
    await draw()
    expect(card()).toBeNull()
  })

  it('shows the headline and two lines, and More opens the rest of the story', async () => {
    answer(surge)
    await draw()
    expect(card()?.textContent).toContain('53 people on your site right now, about 2.7× usual.')
    expect(card()?.textContent).toContain('34 of them came from Facebook')
    expect(card()?.textContent).not.toContain('From 20 to 53')
    expect(card()?.textContent).not.toContain('Peaked at')
    const more = [...document.body.querySelectorAll<HTMLButtonElement>('.side-card button')].find((b) => b.textContent === 'More')
    act(() => {
      more?.click()
    })
    expect(card()?.textContent).toContain('From 20 to 53 in 15 minutes.')
    expect(card()?.textContent).toContain('Peaked at 53')
    expect(card()?.querySelector('svg.side-chart')).not.toBeNull()
  })

  it('See it opens today in Data, filtered to the source, and the card is put away for good', async () => {
    answer(surge)
    await draw()
    const see = document.body.querySelector<HTMLButtonElement>('.side-card .btn.primary')
    expect(see?.textContent).toBe('See it')
    act(() => {
      see?.click()
    })
    expect(setView).toHaveBeenCalledWith({ live: false, period: 'today', from: undefined, to: undefined, filters: [{ dim: 'referrer', value: 'l.facebook.com' }], day: undefined })
    expect(localStorage.getItem('trckable:card:surge:surge_1')).toBe('1')
  })

  it('offers the browser notice only to someone who has not decided, and asks the browser only from its button', async () => {
    answer(surge)
    await draw()
    const notify = [...document.body.querySelectorAll<HTMLButtonElement>('.side-card button')].find((b) => b.textContent?.includes('Get notified next time'))
    expect(notify).toBeDefined()
    expect(pref('notify')).toBe(false)
    await act(() => {
      notify?.click()
      return Promise.resolve()
    })
    expect(pref('notify')).toBe(true)
  })

  it('does not come back once put away, and not for a blocked browser either', async () => {
    localStorage.setItem('trckable:card:surge:surge_1', '1')
    answer(surge)
    await draw()
    expect(card()).toBeNull()
    localStorage.clear()
    vi.stubGlobal('Notification', Object.assign(function Notification() {}, { permission: 'denied', requestPermission: () => Promise.resolve('denied') }))
    await draw()
    expect([...document.body.querySelectorAll('.side-card button')].some((b) => b.textContent?.includes('Get notified'))).toBe(false)
  })
})
