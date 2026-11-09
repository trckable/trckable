// @vitest-environment happy-dom
// What changed: one number under its floor says so for itself and never blocks the page; only too few people in both periods do.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../features/notes/useNotes', () => ({ useNotes: () => ({ notes: [], load: () => undefined }) }))

import type { Report, Result } from '../../../lib/api'
import type { XCtx } from '../ctx'
import type { Overview } from '../types'
import { copy } from '../copy'
import { Changed } from './Changed'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const result = (visitors: number, referrers: [string, number][]): Result =>
  ({
    approximate: false,
    kpis: { visitors, pageviews: visitors * 2, sessions: visitors, bounce_rate: 0.4 },
    series: [],
    dims: { referrer: referrers.map(([value, v]) => ({ value, visitors: v, pageviews: v * 2 })), entry_page: [], country: [], device: [] },
    goals: [],
    money: { revenue: 0 },
  }) as unknown as Result

const report = { current: result(233, [['google.com', 200], ['x.com', 33]]), previous: result(230, [['google.com', 120], ['x.com', 110]]) } as unknown as Report
const thin = { current: result(4, []), previous: result(3, []) } as unknown as Report

const x = { site: { id: 's1', domain: 'site.com' }, filters: [{ key: 'source', value: 'google' }], query: { from: '2026-10-11', to: '2026-11-09' }, money: (n: number) => `$${n}`, widen: vi.fn() } as unknown as XCtx
const kc = (icon: string, label: string, val: string, t: string, c: string) => ({ icon, label, val, note: { t, c }, vals: [1, 2, 3], st: c === 'dn' ? 'dn' : '' })
const kcs = [kc('people', 'People', '233', '+1%', 'up'), kc('views', 'Pageviews', '466', '-4%', 'dn'), kc('signups', 'Sign-ups', '0', copy.tooLittleBefore, ''), kc('sales', 'Money', '$0', '+2%', 'up')]
const model = (r: Report) => ({ kcs, per: 'day', shape: null, down: [], pages: [], sources: [], visits: [], of: 0, report: r }) as unknown as Overview & { report: Report }

let root: Root
let host: HTMLDivElement
const show = (r: Report) => act(() => root.render(<Changed x={x} d={model(r)} />))
const chip = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.xchg-kinds button')].find((b) => b.textContent === label)
const said = () => host.querySelector('.xchg-say')?.textContent

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
  it('keeps the chips, names the metric, and goes back to the comparison', () => {
    show(report)
    expect(said()).not.toBe(copy.sayFew)
    act(() => chip(copy.metric.revenue)?.click())
    expect(said()).toBe(copy.sayNone.revenue)
    expect(host.textContent).not.toContain(copy.fewHere)
    expect(host.querySelectorAll('.xchg-kinds button').length).toBeGreaterThan(1)
    act(() => chip(copy.metric.visitors)?.click())
    expect(said()).not.toBe(copy.sayNone.visitors)
    expect(said()).not.toBe(copy.sayFew)
  })

  it('keeps the whole-period state for too few people in both periods, with the chips', () => {
    show(thin)
    expect(said()).toBe(copy.sayFew)
    expect(host.textContent).toContain(copy.fewHere)
    expect(host.querySelectorAll('.xchg-kinds button').length).toBeGreaterThan(1)
  })
})

describe('what changed, the number cards', () => {
  it('shows the four cards with their changes above the biggest changes in the normal comparison', () => {
    show(report)
    const cards = [...host.querySelectorAll('.sum')]
    expect(cards.map((c) => c.querySelector('.sum-l')?.textContent)).toEqual(['People', 'Pageviews', 'Sign-ups', 'Money'])
    expect(cards[0].querySelector('.sum-n')?.textContent).toContain('+1%')
    expect(cards[1].querySelector('.sum-n')?.textContent).toContain('-4%')
    expect(cards[2].querySelector('.sum-n')?.textContent).toContain(copy.tooLittleBefore)
    const head = host.querySelector('.xchg-head') as Element
    expect(cards[0].compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows them once in the too-little state', () => {
    show(thin)
    expect(host.querySelectorAll('.sum').length).toBe(4)
  })
})
