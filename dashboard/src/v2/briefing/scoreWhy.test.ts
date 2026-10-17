import { describe, expect, it } from 'vitest'
import { overall, trafficFromBand, type Score } from './model'
import { totalOf, whyRows, type ScoreFacts } from './scoreWhy'

const band = { c: 560, lo: 504, hi: 616 }
const scores: Score[] = [trafficFromBand(450, band), { key: 'engagement', value: 100, verdict: 'usual', words: '' }, { key: 'uptime', value: 97, verdict: 'lost', words: '' }]
const facts: ScoreFacts = { traffic: { now: 450, lo: band.lo, hi: band.hi, hourly: true, weekday: 'Saturday', at: '16:06' }, engagement: { leave: 0.41, usual: 0.4 }, uptime: { pct: '99.8', downMin: 1 } }

describe('the sheet behind the score', () => {
  const rows = whyRows(scores, facts)
  it('has one row per part, each with the part\'s own number and its figures', () => {
    expect(rows.map((r) => [r.key, r.value])).toEqual(scores.map((s) => [s.key, s.value]))
    expect(rows[0].figures).toContain('450 people by 16:06')
    expect(rows[0].figures).toContain('504–616')
    expect(rows[1].figures).toContain('41%')
    expect(rows[2].figures).toContain('99.8%')
  })
  it('adds up to the ring', () => {
    expect(totalOf(rows)).toBe(overall(scores))
  })
  it('leaves out a part that has no number, and the ring does not count it', () => {
    const some = whyRows([scores[0], scores[1], { ...scores[2], value: null }], facts)
    expect(some.map((r) => r.key)).toEqual(['traffic', 'engagement'])
    expect(totalOf(some)).toBe(overall([scores[0], scores[1]]))
  })
  it('a past day names no clock time', () => {
    const past = whyRows([scores[0]], { ...facts, traffic: { now: 450, lo: band.lo, hi: band.hi, hourly: false, weekday: 'Tuesday', at: null } })
    expect(past[0].figures).not.toContain(' by ')
  })
})
