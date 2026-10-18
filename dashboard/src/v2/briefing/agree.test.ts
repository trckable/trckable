// The numbers of the Briefing agree: one verdict, read by the headline, the People card, the score and the run of days.
import { describe, expect, it } from 'vitest'
import type { Result } from '../../lib/api'
import { usualNote } from './kpis'
import { overall, sentence, sourceName, trafficFromBand, WEIGHT } from './model'
import { moments, streak } from './moments'
import { bandFromWeeks, dayBandOf, periodBand, usualPeople, verdictOf } from './usual'
import { kpiCards } from './kpis'

const cur = (v: number): Result => ({ approximate: false, kpis: { visitors: v, sessions: v, pageviews: v, bounce_rate: 0.5, avg_session_s: 60, views_per_session: 1, new_visitor_share: 0.5 }, series: [], dims: {}, goals: null })

// A Saturday: 590 people in the day, but the hours add up to 700, against an hourly usual of 560 (band 504 to 616).
const band = { c: 560, lo: 504, hi: 616 }

describe('headline, card and score read one verdict', () => {
  for (const [name, now, st] of [['above', 700, 'up'], ['inside', 580, ''], ['below', 400, 'dn']] as const) {
    it(`${name}: all three say the same`, () => {
      const verdict = verdictOf(now, band)
      expect(verdict?.st).toBe(st)
      const head = sentence({ cur: cur(590), unit: 'today', weekday: 'Saturday', self: 'x.com', downMin: 0, learning: false, band: verdict ? { ratio: verdict.ratio, st: verdict.st, words: 'a usual Saturday' } : null })
      const card = usualNote(verdict?.now ?? 0, verdict?.band.c ?? 0, verdict?.st ?? '')
      const score = trafficFromBand(verdict?.now ?? 0, band)
      const busy = head.lead.includes('busy')
      expect(busy).toBe(st === 'up')
      expect(!!card?.up).toBe(st === 'up')
      expect(!!card?.dn).toBe(st === 'dn')
      expect(score.verdict).toBe({ up: 'above', '': 'usual', dn: 'below' }[st])
      expect(head.bad).toBe(st === 'dn')
    })
  }
})

describe('a run of days and today agree', () => {
  const days = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 8, 8 + i, 12)).toISOString().slice(0, 10))
  const totals: number[] = days.map((_, i) => (i === 39 ? 0 : 100))
  for (let i = 30; i < 39; i++) totals[i] = 300
  it('a day inside the run is above the same band the run is counted by', () => {
    const b = dayBandOf(totals, days, 38)
    expect(b && totals[38] > b.hi).toBe(true)
    expect(streak(totals, days, 38)).toBeGreaterThanOrEqual(3)
  })
  it('today only joins the run when its verdict is above', () => {
    const base = { totals, days, from: 39, to: 39, elapsed: 600, today: true, week: false, filtered: false }
    expect(moments({ ...base, todayUp: verdictOf(580, band)?.st === 'up' }).pills.join()).not.toMatch(/10/)
    expect(moments({ ...base, todayUp: verdictOf(700, band)?.st === 'up' }).pills.join()).toMatch(/10/)
  })
})

describe('a past custom day', () => {
  const base = { cur: cur(300), unit: 'range' as const, weekday: 'Tuesday', self: 'x.com', downMin: 0, learning: false, prev: cur(200) }
  it('a source that sent far fewer people never leads a busy headline', () => {
    const jump = { name: sourceName('lm.facebook.com'), value: 'lm.facebook.com', visitors: 40, times: 0.4, st: 'dn' as const }
    const head = sentence({ ...base, jump })
    expect(head.lead.toLowerCase()).not.toContain('busy')
    expect(head.long.map((p) => p.t).join('')).toContain('Facebook sent far fewer people than usual')
    expect(head.long.map((p) => p.t).join('')).not.toContain('lm.facebook.com')
  })
  it('names places people know, under any subdomain', () => {
    expect([sourceName('lm.facebook.com'), sourceName('l.instagram.com'), sourceName('m.youtube.com'), sourceName('example.org')]).toEqual(['Facebook', 'Instagram', 'YouTube', 'example.org'])
  })
  it('the score counts only the parts that have a number', () => {
    const t = { key: 'traffic' as const, value: 80, verdict: 'usual' as const, words: '' }
    const e = { key: 'engagement' as const, value: 100, verdict: 'usual' as const, words: '' }
    const u = { key: 'uptime' as const, value: null, verdict: 'none' as const, words: '' }
    expect(overall([t, e, u])).toBe(Math.round((80 * WEIGHT.traffic + 100 * WEIGHT.engagement) / (WEIGHT.traffic + WEIGHT.engagement)))
    expect(overall([t, e, { ...u, value: 100 }])).toBe(Math.round(80 * 0.4 + 100 * 0.25 + 100 * 0.35))
  })
})

// Live, a Sunday morning: the hours add up to a usual of 0 to 0, while the server lists the last Sundays as 0, 1 and 8.
describe('one band for the same people on the same day', () => {
  const hourly = { c: 0, lo: 0, hi: 0 }
  it('reads the weeks the Why? lists, so the headline, the card and the homepage visit card share it', () => {
    const { band } = usualPeople([0, 1, 8], hourly)
    expect(band).toEqual(bandFromWeeks([0, 1, 8]))
    expect(Math.round(band?.hi ?? 0)).toBe(6)
    const verdict = verdictOf(2, band)
    expect(verdict?.st).toBe('')
    const head = sentence({ cur: cur(2), unit: 'today', weekday: 'Sunday', self: 'x.com', downMin: 0, learning: false, band: verdict ? { ratio: verdict.ratio, st: verdict.st, words: 'a usual Sunday' } : null })
    expect(head.lead.toLowerCase()).not.toContain('busy')
  })
  it('never calls a number above a usual of nothing: too little history says so', () => {
    expect(verdictOf(2, hourly)).toBeNull()
    expect(verdictOf(2, { c: 0, lo: 0, hi: 0.4 })).toBeNull()
    const kc = kpiCards({ cur: { ...cur(2), series: [] }, learning: false, before: 'x', people: { note: { t: 'p' }, vals: [] }, goal: null, viewsVals: [], leave: { note: { t: 'l' }, vals: [] }, uptime: { key: 'uptime', value: 100, verdict: 'clear', words: '' } as never, low: true, peopleVerdict: null, uptimePct: '100', uptimeVals: [], moneyVals: [] })
    expect(kc[0].note?.t).toBe('learning')
  })
})

// Live, last 30 days: 169 people, and a usual of "0 to 5" that was one day's range summed over days.
describe('a long period is told against a usual period', () => {
  const days = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 6, 21 + i, 12)).toISOString().slice(0, 10))
  // A small site: a few people a day, a crowd now and then.
  const totals = days.map((_, i) => (i % 9 === 0 ? 12 : 1 + (i % 3)))
  const from = days[60]
  const to = days[89]
  const own = totals.slice(60).reduce((a, b) => a + b, 0)
  it('compares the month with the month before, never with a day', () => {
    const b = periodBand(totals, days, from, to, own)
    expect(b).not.toBeNull()
    expect(b?.hi).toBeGreaterThan(own * 0.5)
    const verdict = verdictOf(own, b)
    expect(verdict && verdict.band.hi).toBeGreaterThan(20)
    expect(verdict?.st).toBe('')
  })
  it('has no usual month before two whole months of history', () => {
    expect(periodBand(totals.slice(30), days.slice(30), days[60], to, own)).toBeNull()
  })
  it('counts the share of today that has passed when the period ends today', () => {
    const whole = periodBand(totals, days, from, to, own, 1)
    const half = periodBand(totals, days, from, to, own, 0.5)
    expect((half?.c ?? 0) < (whole?.c ?? 0)).toBe(true)
  })
})
