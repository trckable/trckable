// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { HeroChart, type ChartIn, type ChartPoint } from './DayChart'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const point = (i: number, v: number): ChartPoint => ({ i, name: `${i}:00`, v, lo: 0, hi: 1, st: 'up', raw: v, was: null, delta: null })

const chart = (usual: ChartIn['usual']): ChartIn => ({
  points: [3, 5, 9, 12, 8].map((v, i) => point(i, v)),
  axis: [],
  span: 5,
  full: 5,
  live: false,
  elapsed: 0,
  band: true,
  usual,
  compare: null,
  noCompare: null,
  startsOn: null,
  learn: null,
  overall: '',
  unit: 'people',
  bucket: 'hour',
  downs: [],
  notes: [],
})

function lit(c: ChartIn): number {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<HeroChart c={c} at={null} onAt={() => {}} />))
  const n = host.querySelectorAll('.chhot').length
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  return n
}

describe('the day chart while the usual is still being learned', () => {
  it('lights no stretch of the line when no bucket has a usual yet', () => {
    expect(lit(chart([null, null, null, null, null]))).toBe(0)
  })
  it('lights the buckets that rose above a usual that is there', () => {
    expect(lit(chart(Array(5).fill({ lo: 2, hi: 6 })))).toBeGreaterThan(0)
  })
})
