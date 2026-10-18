// One multiple, said the same on every screen: the Briefing's headline, the chart's label over the rise, and Explore's
// row all count it from the same figure against the same usual (the one rule is timesUsual).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Point, Result } from '../lib/api'
import { chartOf } from './briefing/chart'
import { mult, sentence, type Part } from './briefing/model'
import { timesUsual, type Band } from './briefing/usual'
import { rowsOf } from './explore/data/stats'
import { withSourceUsuals } from './explore/data/scaled'
import { XTable } from './ui/XTable'

const kpis = { visitors: 0, sessions: 0, pageviews: 0, bounce_rate: 0, avg_session_s: 0, views_per_session: 0, new_visitor_share: 0 }
const pts = (xs: number[]): Point[] => xs.map((visitors, h) => ({ t: `2026-10-16T${String(h).padStart(2, '0')}:00`, visitors, pageviews: visitors }))
const res = (xs: number[], dims: Result['dims'] = {}, v = 0): Result => ({ approximate: false, kpis: { ...kpis, visitors: v }, series: pts(xs), dims, goals: null })
const text = (p: Part[]) => p.map((x) => x.t).join('')

describe('the same multiple on every screen', () => {
  const band: Band = { c: 23, lo: 18, hi: 28 }
  const hn = 533
  const times = timesUsual(hn, band)
  const said = mult(times as number)

  it('counts from the source and its own usual, and says nothing for a usual too small', () => {
    expect(said).toBe('23×')
    expect(timesUsual(10, { c: 0.2, lo: 0, hi: 1 })).toBeNull()
    expect(timesUsual(10, null)).toBeNull()
  })

  it('the Briefing headline says it', () => {
    const s = sentence({ cur: res([], {}, 700), unit: 'today', weekday: 'Friday', self: 'x.com', downMin: 0, learning: false, jump: { name: 'Hacker News', value: 'news.ycombinator.com', visitors: hn, times, st: 'up', vs: 'your usual' } })
    expect(text(s.long)).toContain(`${said} your usual`)
  })

  it('the chart label over the rise says it, not the whole site hour', () => {
    // The hour doubles for the whole site (2.5x a usual hour), but the label names the source: it carries the source's figure.
    const c = chartOf({ cur: res([5, 5, 40, 5]), prev: res([5, 5, 16, 5]), bucket: 'hour', unit: 'today', weekday: 'Friday', riseName: 'Hacker News', riseTimes: times as number, riseVs: 'your usual' })
    expect(c.rise?.text).toBe(`Hacker News · ${said} your usual`)
    expect(c.rise?.short).toContain(said)
  })

  it('Explore row says it, once the row is told against the same usual', () => {
    const prev = { ...res([]), dims: { referrer: [{ value: 'news.ycombinator.com', visitors: 3 }] } }
    const told = withSourceUsuals(prev, new Map([['news.ycombinator.com', band.c]]))
    const rows = rowsOf([{ value: 'news.ycombinator.com', visitors: hn }], told.dims.referrer, 700, (v) => v)
    expect(rows[0]).toMatchObject({ v: hn, c: 23, st: 'up' })
    expect(renderToStaticMarkup(<XTable rows={rows} head="Source" limit={5} of={10} onAll={() => {}} />)).toContain(`▲ ${said}`)
  })
})
