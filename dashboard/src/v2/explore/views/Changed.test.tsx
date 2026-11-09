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
const model = (r: Report) => ({ kcs: [], per: 'day', shape: null, down: [], pages: [], sources: [], visits: [], of: 0, report: r }) as unknown as Overview & { report: Report }

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
