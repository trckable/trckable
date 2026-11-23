// @vitest-environment happy-dom
// What changed, the Briefing: four cards. One number under its floor says so for itself and never blocks the page; only too few people in both periods do.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../features/notes/useNotes', () => ({ useNotes: () => ({ notes: [], load: () => undefined }) }))

import type { Report, Result } from '../../../lib/api'
import type { XCtx } from '../ctx'
import type { Briefing } from '../types'
import { copy } from '../copy'
import { Changed } from './Changed'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const rows = (o: [string, number][]) => o.map(([value, v]) => ({ value, visitors: v, pageviews: v * 2 }))
const result = (visitors: number, referrers: [string, number][], pages: [string, number][] = [], signup?: number): Result =>
  ({
    approximate: false,
    kpis: { visitors, pageviews: visitors * 2, sessions: visitors, bounce_rate: 0.4 },
    series: [],
    dims: { referrer: rows(referrers), entry_page: [], page: rows(pages), country: [], device: [] },
    goals: [],
    money: { revenue: 0 },
    ...(signup === undefined ? {} : { signup: { goal: 'signup', visitors: signup } }),
  }) as unknown as Result

const pages: [string, number][] = [['/', 120], ['/pricing', 60], ['/blog', 30]]
const report = { current: result(233, [['google.com', 200], ['x.com', 33]], pages, 12), previous: result(230, [['google.com', 120], ['x.com', 110]], pages) } as unknown as Report
const rising = { current: result(300, [['a.com', 250], ['b.com', 50]], pages, 12), previous: result(200, [['a.com', 150], ['b.com', 50]], pages) } as unknown as Report
const thin = { current: result(4, []), previous: result(3, []) } as unknown as Report

const x = { site: { id: 's1', domain: 'site.com', timezone: 'UTC' }, view: { period: '7d' }, filters: [{ key: 'source', value: 'google' }], query: { from: '2026-10-11', to: '2026-11-09' }, money: (n: number) => `$${n}`, widen: vi.fn(), goTo: vi.fn(), goWith: vi.fn() } as unknown as XCtx
const kc = (icon: string, label: string, val: string, t: string, c: string) => ({ icon, label, val, note: { t, c }, vals: [1, 2, 3], st: c === 'dn' ? 'dn' : '' })
const kcs = [kc('people', 'People', '233', '+1%', 'up'), kc('views', 'Pageviews', '466', '-4%', 'dn')]
const model = (r: Report, o: Partial<Briefing> = {}) => ({ kcs, per: 'day', shape: null, down: [], lost: 0, pages: [], sources: [], visits: [], of: 0, report: r, google: null, ...o }) as unknown as Briefing

let root: Root
let host: HTMLDivElement
const show = (d: Briefing) => act(() => root.render(<Changed x={x} d={d} />))
const said = () => host.querySelector('.xbr-say')?.textContent
const titles = () => [...host.querySelectorAll('.xcp-h')].map((h) => h.textContent)
const card = (id: string) => host.querySelector(`[data-briefing=${id}]`) as HTMLElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('what changed, one number under its floor', () => {
  it('says the sentence for people, with no switch to another number', () => {
    show(model(report))
    expect(said()).not.toBe(copy.sayFew)
    expect(host.querySelectorAll('[role=tab], [aria-pressed], .xchg-kinds').length).toBe(0)
  })

  it('keeps the whole-period state for too few people in both periods, and draws no cards under it', () => {
    show(model(thin))
    expect(said()).toBe(copy.sayFew)
    expect(host.textContent).toContain(copy.fewHere)
    expect(titles()).toEqual(['Last 7 days'])
  })
})

describe('what changed, the four cards', () => {
  it('shows the period, What moved, Where they came from and What they looked at, and no number tiles', () => {
    show(model(report))
    expect(titles()).toEqual(['Last 7 days', copy.cardMoved, copy.cardSources, copy.cardPages])
    expect(host.querySelectorAll('.sum').length).toBe(0)
  })

  it('puts people with their change, sign-ups with their share, and the site status in Today', () => {
    show(model(report))
    const today = card('today')
    expect(today.querySelector('[data-num=people]')?.textContent).toContain('233')
    expect(today.querySelector('[data-num=people] em')).toBeNull() // the sentence gives no figure here, so nothing else does
    expect(today.querySelector('[data-num=signups]')?.textContent).toContain('12')
    expect(today.querySelector('[data-num=signups]')?.textContent).toContain(`5.2% ${copy.ofPeople}`)
    expect(today.querySelector('.xbr-pill.ok')?.textContent).toBe(copy.siteOk)
  })

  it('says the downtime in the pill, and nothing where the site is not watched', () => {
    show(model(report, { lost: 3600, down: [{ from: '11-01 10:00', to: '11-01 11:00', min: 60 }] }))
    expect(card('today').querySelector('.xbr-pill.dn')?.textContent).toContain('1')
    show(model(report, { lost: null }))
    expect(card('today').querySelector('.xbr-pill')).toBeNull()
  })

  it('lists at most five movers, signed, and the pages with the home page named', () => {
    show(model(report))
    expect(card('moved').querySelectorAll('.xmv-row').length).toBeLessThanOrEqual(5)
    expect(card('moved').querySelector('.xmv-n')?.textContent).toMatch(/^[+−]/)
    const first = card('pages').querySelector('.xtr-row')
    expect(first?.textContent).toContain(copy.homePage)
    expect(first?.textContent).toContain('120')
    expect(card('pages').textContent).toContain(copy.allPagesInExplore)
  })

  it('shows an arrow with the change on each source, and no tabs', () => {
    show(model(report))
    const lines = [...card('sources').querySelectorAll('.xtr-row')]
    expect(lines.map((r) => r.querySelector('.xtr-d')?.textContent)).toEqual(['↑ 67%', '↓ 70%'])
    expect(card('sources').querySelector('[role=tab]')).toBeNull()
  })
})

describe('what changed, one change number', () => {
  it('writes beside the people the same percent the sentence writes', () => {
    show(model(rising))
    expect(said()).toContain('rose 50%')
    expect(card('today').querySelector('[data-num=people] em')?.textContent).toBe('↑ 50%')
    expect(host.textContent).not.toContain('vs last week')
    expect(host.textContent).not.toContain('Notes (')
  })

  it('lists the cause the sentence names as the first row of What moved', () => {
    show(model(rising))
    expect(said()).toContain('a.com')
    expect(card('moved').querySelector('.xmv-row')?.textContent).toContain('a.com')
  })
})

describe('what changed, Google in the sources', () => {
  it('turns the Google row into the path from shown to clicked to arrived when Search Console is connected', () => {
    show(model(report, { google: { shown: 12400, clicked: 310 } }))
    const g = card('sources').querySelector('[data-google=path]') as HTMLElement
    expect(g.textContent).toContain(copy.googlePeople('200'))
    expect(g.querySelector('.xbr-g-path')?.textContent).toBe(`${copy.googleShown} 12,400 → ${copy.googleClicked} 310 → ${copy.googleArrived} 200`)
    expect(g.querySelector('.xbr-g-note')?.textContent).toBe(copy.googleNote)
    expect(card('sources').querySelectorAll('.xtr-row').length).toBe(2)
  })

  it('puts Google first even when it is not among the biggest sources, with three others after it', () => {
    const none = { current: result(300, [['a.com', 100], ['b.com', 90], ['c.com', 60], ['d.com', 50]], pages), previous: result(200, [['a.com', 100]], pages) } as unknown as Report
    show(model(none, { google: { shown: 900, clicked: 40 } }))
    const kids = [...(card('sources').querySelector('.xcp-b')?.children ?? [])]
    expect(kids[0].getAttribute('data-google')).toBe('path')
    expect(kids.length).toBe(4)
    expect(kids[1].textContent).toContain('a.com')
  })

  it('keeps a plain Google row where Search Console is not connected', () => {
    show(model(report))
    expect(card('sources').querySelector('[data-google]')).toBeNull()
    expect(card('sources').textContent).toContain('google.com')
  })
})
