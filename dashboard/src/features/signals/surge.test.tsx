// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setView = vi.fn<(patch: unknown) => void>()
vi.mock('../../lib/url', () => ({ setView: (p: unknown) => setView(p) }))
vi.mock('../../components/Toast', () => ({ toast: vi.fn() }))

import SurgeCard from './SurgeCard'
import { beats, clock, deviceShare, honestLine, peakSlice, sourceHost, sourceLine, startSlice, surgeChip, surgeFilter, surgeNotice, type Story, type Surge } from './surge'

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
  sources: [{ name: 'Facebook', n: 34 }, { name: 'Google', n: 6 }],
  pages: [{ name: '/blog/launch-post', n: 30 }],
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
  it('says who sent most of them in one line, and how many only when it is not most', () => {
    expect(sourceLine(surge)).toBe('Mostly from Facebook')
    expect(sourceLine({ ...surge, why: { ...surge.why, source_n: 20 } })).toBe('20 from Facebook')
    expect(sourceLine({ ...surge, why: { ...surge.why, source: 'Direct', source_dim: 'channel', source_value: 'Direct', source_n: 40 } })).toBe('Mostly direct visits')
    expect(sourceLine({ ...surge, why: { source_usual: 0, before: 0, minutes: 15 } })).toBe('')
    expect(sourceHost(surge)).toBe('facebook.com')
    expect(surgeChip(surge)).toBe('2.7× usual')
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
  it('has three beats in time order: when it began and from where, the peak, now', () => {
    const b = beats(surge, 'UTC')
    expect(b.map((x) => x.key)).toEqual(['start', 'peak', 'now'])
    expect(b[0].text).toBe(`${clock(story.start ?? 0, 'UTC')} started · Facebook`)
    expect(b[1].text).toBe(`${clock(story.peak_at, 'UTC')} peak 53`)
    expect(b[2].text).toBe('now 31')
  })
  it('says it has been busy longer when the climb began before the hour', () => {
    expect(beats({ ...surge, story: { ...story, start: undefined } }, 'UTC')[0].text).toBe('Busy for more than an hour')
  })
  it('says what it only looks like, and never claims the exact post', () => {
    expect(honestLine(surge)).toBe('Looks like a link on Facebook, landing on /blog/launch-post, started sending people. The exact post isn’t visible.')
    expect(honestLine({ ...surge, why: { source_usual: 0, before: 0, minutes: 15 } })).toBe('The climb began without a referring site we can see.')
  })
  it('splits phones and computers only with five people whose device is known', () => {
    expect(deviceShare(story)).toEqual({ phone: 75, computer: 25 })
    expect(deviceShare({ ...story, devices: 4 })).toBeNull()
  })
  it('marks the slice the climb began in and the busiest one', () => {
    expect(startSlice(story)).toBe(8)
    expect(startSlice({ ...story, start: undefined })).toBeUndefined()
    expect(peakSlice(story)).toBe(9)
  })
})

let root: Root
let host: HTMLDivElement
const answer = (s: Surge | null) =>
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ surge: s }) }))
const draw = async () => {
  await act(() => {
    root.render(<SurgeCard site={{ id: 'tkb_x', domain: 'a.com', timezone: 'UTC' }} first={0} />)
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

  it('is a number, a chip, one line and two buttons: no paragraphs', async () => {
    answer(surge)
    await draw()
    expect(card()?.querySelector('.sg-count')?.textContent).toBe('53')
    expect(card()?.querySelector('.sg-chip')?.textContent).toBe('2.7× usual')
    expect(card()?.querySelector('.sg-source span:last-child')?.textContent).toBe('Mostly from Facebook')
    expect(card()?.querySelector('svg.side-chart')).not.toBeNull()
    expect([...(card()?.querySelectorAll('.side-card-actions button') ?? [])].map((b) => b.textContent)).toEqual(['More', 'See it'])
    expect(card()?.querySelectorAll('p').length).toBe(1)
  })

  it('More opens the story as a dialog with the beats, the tiles and the honest line, and Escape closes it', async () => {
    answer(surge)
    await draw()
    const more = [...document.body.querySelectorAll<HTMLButtonElement>('.side-card button')].find((b) => b.textContent === 'More')
    act(() => {
      more?.click()
    })
    for (let i = 0; i < 40 && !document.body.querySelector('[role="dialog"]'); i++) await act(() => new Promise((r) => setTimeout(r, 25)))
    const dlg = document.body.querySelector('[role="dialog"]')
    expect(dlg?.getAttribute('aria-modal')).toBe('true')
    expect(dlg?.textContent).toContain('20 → 53 in 15 min')
    expect(dlg?.textContent).toContain('peak 53')
    expect(dlg?.textContent).toContain('now 31')
    expect(dlg?.textContent).toContain('Albania')
    expect(dlg?.textContent).toContain('Phone')
    expect(dlg?.textContent).toContain('/blog/launch-post')
    expect(dlg?.textContent).toContain('The exact post isn’t visible.')
    expect(dlg?.querySelector('svg[role="img"]')).not.toBeNull()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
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

  it('does not come back once put away', async () => {
    localStorage.setItem('trckable:card:surge:surge_1', '1')
    answer(surge)
    await draw()
    expect(card()).toBeNull()
  })
})
