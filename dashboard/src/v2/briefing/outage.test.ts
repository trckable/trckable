import { describe, expect, it } from 'vitest'
import { downSeconds, insideSeconds, outageSpans, periodEnd } from './outage'

const DAY = 86400
const from0 = 1_760_000_000

describe('the incident timeline', () => {
  it('ends a month at the end of its last day, not at the end of its first', () => {
    expect(periodEnd(from0, '2026-09-21', '2026-10-20')).toBe(from0 + 30 * DAY)
    expect(periodEnd(from0, '2026-10-20', '2026-10-20')).toBe(from0 + DAY)
  })
  it('puts a short incident in a long period where it was, and never outside the line', () => {
    const end = periodEnd(from0, '2026-09-21', '2026-10-20')
    const { spans } = outageSpans([{ started_at: from0 + 20 * DAY + 3600, ended_at: from0 + 20 * DAY + 3600 + 23 * 60 }], from0, end, from0 + 29 * DAY)
    expect(spans).toHaveLength(1)
    expect(spans[0].a).toBeCloseTo(20.04 / 30, 2)
    expect(spans[0].b).toBeGreaterThan(spans[0].a)
    expect(spans[0].b).toBeLessThan(1)
  })
  it('draws each incident on its own, and one still going up to now', () => {
    const end = from0 + 10 * DAY
    const { spans, nowAt } = outageSpans(
      [
        { started_at: from0 + DAY, ended_at: from0 + DAY + 600 },
        { started_at: from0 + 8 * DAY, ended_at: null },
      ],
      from0,
      end,
      from0 + 9 * DAY,
    )
    expect(spans.map((s) => [s.a, s.b])).toEqual([
      [0.1, 0.1 + 600 / (10 * DAY)],
      [0.8, 0.9],
    ])
    expect(nowAt).toBe(0.9)
  })
  it('keeps what began before the period from its start', () => {
    expect(outageSpans([{ started_at: from0 - DAY, ended_at: from0 + DAY }], from0, from0 + 4 * DAY, from0 + 3 * DAY).spans).toEqual([{ a: 0, b: 0.25 }])
  })
})

describe('minutes down inside the period', () => {
  const from = 1_000_000
  const to = from + 86400
  it('counts only the part of an outage inside the period', () => {
    // started 60 min before the period, ended 40 min into it: 40 min count
    expect(insideSeconds({ started_at: from - 3600, ended_at: from + 2400 }, from, to, to)).toBe(2400)
    // one still going ends at now, cut at the period's end
    expect(insideSeconds({ started_at: to - 600, ended_at: null }, from, to, to + 5000)).toBe(600)
    expect(insideSeconds({ started_at: from - 900, ended_at: from - 300 }, from, to, to)).toBe(0)
  })
  it('adds the outages up with the one rule', () => {
    const list = [{ started_at: from - 3600, ended_at: from + 2400 }, { started_at: from + 7200, ended_at: from + 7800 }]
    expect(downSeconds(list, from, to, to) / 60).toBe(50)
  })
})
