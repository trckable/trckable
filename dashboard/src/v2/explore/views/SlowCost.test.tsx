// @vitest-environment happy-dom
// The cost card: the sentence, the three bands, the filter a band sets, and the one line when there is nothing to compare.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copy } from '../slowCostCopy'
import type { XCtx } from '../ctx'
import type { SlowCostModel } from '../types'
import { SlowCost } from './SlowCost'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const pickAny = vi.fn()
const x = { limit: 5, showAll: vi.fn(), pickAny, money: (m: number) => `$${m / 100}` } as unknown as XCtx
const row = (band: 'slow' | 'mid' | 'fast', visits: number, rate: number, lost: number, pages: string[]) => ({ band, visits, rate, lost, pages })
const loss: SlowCostModel = { kind: 'money', verdict: 'loss', lost: 35000, mostSlow: true, rows: [row('slow', 1000, 0.01, 20000, ['/a', '/b']), row('mid', 1000, 0.02, 15000, []), row('fast', 2000, 0.05, 0, ['/c'])] }
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  pickAny.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('SlowCost', () => {
  it('says the month, the method, and each band', () => {
    act(() => root.render(<SlowCost x={x} d={loss} />))
    expect(host.textContent).toContain(copy.lostMoneyMost('$350'))
    expect(host.textContent).toContain(copy.method)
    expect(host.textContent).toContain(copy.bandSlow)
    expect(host.textContent).toContain(copy.bandMid)
    expect(host.textContent).toContain(copy.bandFast)
    expect(host.textContent).toContain('$200')
  })

  it('leaves out "most of it" when the slowest band is not most of it', () => {
    act(() => root.render(<SlowCost x={x} d={{ ...loss, mostSlow: false }} />))
    expect(host.textContent).toContain(copy.lostMoney('$350'))
    expect(host.textContent).not.toContain(copy.lostMoneyMost('$350'))
  })

  it('counts conversions without payments', () => {
    act(() => root.render(<SlowCost x={x} d={{ ...loss, kind: 'goals', lost: 40, rows: loss.rows.map((r) => ({ ...r, lost: 0 })) }} />))
    expect(host.textContent).toContain(copy.lostGoalsMost('40'))
  })

  it('filters to the pages of the band that is tapped', () => {
    act(() => root.render(<SlowCost x={x} d={loss} />))
    const rows = [...host.querySelectorAll('button')]
    expect(rows).toHaveLength(2) // the middle band has no page to filter to
    act(() => rows[0].click())
    expect(pickAny).toHaveBeenCalledWith('page', ['/a', '/b'])
  })

  it('claims nothing when there is nothing to compare', () => {
    act(() => root.render(<SlowCost x={x} d={{ ...loss, verdict: 'few', lost: 0 }} />))
    expect(host.textContent).toBe(copy.few)
  })
})
