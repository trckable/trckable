// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setView = vi.fn<(patch: unknown) => void>()
vi.mock('../../lib/url', () => ({ setView: (p: unknown) => setView(p) }))
vi.mock('../../components/Toast', () => ({ toast: vi.fn() }))

import { dropReports } from '../../lib/api'
import { addDays } from '../../lib/dates'
import { openSurgeStory } from './openStory'
import SurgeCard from './SurgeCard'
import SurgeModal from './SurgeModal'
import { bannerLine, beats, clock, localHour, seeInData, deviceShare, honestLine, midTruncate, peakSlice, sourceHost, sourceLine, startSlice, surgeChip, surgeFilter, surgeNotice, type Story, type Surge } from './surge'

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
    expect(honestLine(surge)).toBe('Looks like a link on Facebook started sending people. The exact post isn’t visible.')
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
const answer = (s: Surge | null, report?: unknown) =>
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/report')) return report ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(report) }) : Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ surge: s }) })
  })
const draw = async () => {
  await act(() => {
    root.render(<SurgeCard site={{ id: 'tkb_x', domain: 'a.com', timezone: 'UTC' }} first={0} />)
    return Promise.resolve()
  })
  await act(() => new Promise((r) => setTimeout(r, 40)))
  await act(() => Promise.resolve())
}
const card = () => document.body.querySelector('.side-card')

beforeEach(() => {
  localStorage.clear()
  dropReports()
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

describe('Data landed on the moment', () => {
  const over: Surge = { ...surge, ended: surge.started + 25 * 60 }
  const now = new Date((surge.started + 3600) * 1000)
  it('opens the days around it by the hour, against the same days a week earlier, with no filter', () => {
    const day = localHour(surge.started, 'UTC').day
    expect(seeInData(over, 'UTC', now)).toEqual({ live: false, period: 'custom', from: day, to: day, bucket: 'hour', compare: 'custom', cfrom: addDays(day, -7), cto: addDays(day, -7), filters: [], day: undefined, v: 'explore', story: undefined, surge: surge.started })
  })
  it('runs to now while the moment lasts', () => {
    const live = seeInData(surge, 'UTC', new Date((surge.started + 40 * 3600) * 1000))
    expect(live.to).toBe(localHour(surge.started + 40 * 3600, 'UTC').day)
  })
  it('says when, how busy and who sent them, in one line', () => {
    expect(bannerLine(over, 'UTC')).toBe(`Busy moment ${clock(over.started, 'UTC')}–${clock(over.started + 25 * 60, 'UTC')} · 53 at peak · from Facebook`)
    expect(bannerLine(surge, 'UTC')).toContain(`since ${clock(surge.started, 'UTC')}`)
  })
})

describe('the surge card', () => {
  it('is not there when no surge is on', async () => {
    answer(null)
    await draw()
    expect(card()).toBeNull()
  })

  it('is a number, a chip, one line, a sneak peek and two buttons', async () => {
    answer(surge)
    await draw()
    expect(card()?.querySelector('.sg-count')?.textContent).toBe('53')
    expect(card()?.querySelector('.sg-chip')?.textContent).toBe('2.7× usual')
    expect(card()?.querySelector('.sg-source span:last-child')?.textContent).toBe('Mostly from Facebook')
    expect(card()?.querySelector('svg.sg-spark')).not.toBeNull()
    expect([...(card()?.querySelectorAll('.side-card-actions button') ?? [])].map((b) => b.textContent)).toEqual(['More', 'See it in Data'])
  })

  it('the number opens the same dialog as More, and so does openSurgeStory(id) from outside', async () => {
    answer(surge)
    await draw()
    act(() => card()?.querySelector<HTMLButtonElement>('.sg-hero')?.click())
    for (let i = 0; i < 40 && !document.body.querySelector('[role="dialog"]'); i++) await act(() => new Promise((r) => setTimeout(r, 25)))
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('20 → 53 in 15 min')
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    act(() => openSurgeStory('surge_1'))
    for (let i = 0; i < 40 && !document.body.querySelector('[role="dialog"]'); i++) await act(() => new Promise((r) => setTimeout(r, 25)))
    const dlg = document.body.querySelector('[role="dialog"]')
    expect(dlg?.querySelector('svg[role="img"]')).not.toBeNull()
    expect(dlg?.querySelectorAll('.sgm-beats li').length).toBe(3)
    expect(dlg?.querySelectorAll('.sgm-tile').length).toBe(4)
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

  it('See it in Data, on the card and in the story, opens today in Data filtered to the source, and the card is put away for good', async () => {
    answer(surge)
    await draw()
    const see = [...document.body.querySelectorAll<HTMLButtonElement>('.side-card .side-card-actions button')].find((b) => b.textContent === 'See it in Data')
    act(() => {
      see?.click()
    })
    expect(setView).toHaveBeenCalledWith(expect.objectContaining({ live: false, period: 'custom', bucket: 'hour', compare: 'custom', filters: [], v: 'explore', surge: surge.started }))
    expect(localStorage.getItem('trckable:card:surge:surge_1')).toBe('1')
  })

  it('does not come back once put away', async () => {
    localStorage.setItem('trckable:card:surge:surge_1', '1')
    answer(surge)
    await draw()
    expect(card()).toBeNull()
  })
})

describe('the story told by a notice (no story of its own)', () => {
  const told: Surge = { id: 'ntf_1', started: surge.started + 60, online: 53, usual: 20, times: 2.7, why: { source: 'Facebook', source_dim: 'referrer', source_n: 34, source_usual: 0, before: 0, minutes: 0 } }
  const open = async (site = 'tkb_x') => {
    await act(() => {
      root.render(<SurgeModal surge={told} site={site} tz="UTC" onClose={() => {}} onSee={() => {}} />)
      return Promise.resolve()
    })
    await act(() => new Promise((r) => setTimeout(r, 40)))
  }
  const dialog = () => document.body.querySelector('[role="dialog"]')

  it('loads the story of the surge that is on and shows the chart, the beats and the tiles', async () => {
    answer(surge)
    await open()
    expect(dialog()?.querySelector('svg[role="img"]')).not.toBeNull()
    expect(dialog()?.querySelectorAll('.sgm-beats li').length).toBe(3)
    expect(dialog()?.querySelectorAll('.sgm-tile').length).toBe(4)
    expect(dialog()?.textContent).toContain('20 → 53 in 15 min')
  })

  it('keeps a long landing path out of the sentence and in a middle-truncated chip', async () => {
    const page = '/news/' + 'raimonda-sino-plani-individual-i-zhvp-se-2026-'.repeat(2) + 'x'.repeat(20) + '-2024'
    expect(page.length).toBeGreaterThanOrEqual(120)
    answer({ ...surge, why: { ...surge.why, page } })
    await open()
    expect(dialog()?.querySelector('.sgm-honest')?.textContent).not.toContain('/news')
    const chip = dialog()?.querySelector<HTMLElement>('.sgm-path')
    expect(chip?.getAttribute('aria-label')).toBe(page)
    expect(chip?.textContent).toBe(midTruncate(page))
    expect(chip?.textContent).toMatch(/^\/news\/.*….*-2024$/)
    expect((chip?.textContent ?? '').length).toBeLessThanOrEqual(34)
    expect(midTruncate('/blog/launch-post')).toBe('/blog/launch-post')
  })

  const endedAt = told.started + 20 * 60
  const stored: Surge = {
    ...surge,
    ended: endedAt,
    story: { ...story, at: endedAt + 30 * 60, series: [3, 4, 3, 5, 4, 6, 31, 53, 49, 40, 22, 9, 5, 4, 3, 3], start: told.started - 60, peak_at: told.started + 5 * 60, now: 3, sources: undefined, pages: undefined, countries: undefined, devices: undefined },
  }
  const asked = (live: Surge | null, past: Surge | null) =>
    vi.stubGlobal('fetch', (url: string) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ surge: url.includes('/surges/near') ? past : live }) }))

  it('draws an ended busy moment from its own window, the start marked, with the time it ended', async () => {
    asked(null, stored)
    await open()
    expect(dialog()?.querySelector('svg[role="img"]')).not.toBeNull()
    expect(dialog()?.querySelector('svg .mark')).not.toBeNull()
    expect(dialog()?.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toContain('People online from')
    expect(dialog()?.querySelector('.sgm-ended')?.textContent).toMatch(/^Ended \d\d:\d\d$/)
    expect([...(dialog()?.querySelectorAll('.sgm-beats li') ?? [])].map((li) => li.textContent)).not.toContain('now 3')
    expect(dialog()?.textContent).toContain('The exact post isn’t visible.')
    expect(dialog()?.textContent).not.toContain('no longer shown')
  })

  it('keeps what it was told when the moment cannot be read at all, with no chart and no apology', async () => {
    asked(null, null)
    await open()
    expect(dialog()?.querySelector('svg[role="img"]')).toBeNull()
    expect(dialog()?.textContent).toContain('53')
    expect(dialog()?.textContent).not.toContain('no longer shown')
  })

  it('shows a short loading line while it asks', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    await open()
    expect(dialog()?.textContent).toContain('Loading the last hour')
  })
})
