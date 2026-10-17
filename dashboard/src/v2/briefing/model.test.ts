import { describe, expect, it } from 'vitest'
import type { Point, Result, Row } from '../../lib/api'
import { bandOf, engagementFromBounce, engagementScore, mult, overall, sentence, sourceName, topSource, trafficFromBand, trafficScore, unitOf, untilNow, uptimeScore, type Part, type SayIn } from './model'

const rows = (xs: [string, number][]): Row[] => xs.map(([value, visitors]) => ({ value, visitors }))
const kpis = (o: Partial<Result['kpis']> = {}): Result['kpis'] => ({ visitors: 0, sessions: 0, pageviews: 0, bounce_rate: 0.5, avg_session_s: 60, views_per_session: 2, new_visitor_share: 0.5, ...o })
const result = (v: number, dims: Result['dims'] = {}, extra: Partial<Result> = {}): Result => ({ approximate: false, kpis: kpis({ visitors: v, sessions: v }), series: [], dims, goals: null, ...extra })
const say = (o: Partial<SayIn> & Pick<SayIn, 'cur'>): ReturnType<typeof sentence> => sentence({ unit: 'today', weekday: 'Friday', self: 'x.com', downMin: 0, learning: false, ...o })
const text = (p: Part[]) => p.map((x) => x.t).join('')
const money = { currency: 'USD', exponent: 2, revenue: 8700, refunds: 0, payments: 1, customers: 1, paying_visitors: 1, conversion: 0, revenue_per_visitor: 0, new_revenue: 0, renewal_revenue: 0, unattributed: 0, unconverted: 0 }

describe('periods and multiples', () => {
  it('names the kind of period', () => {
    expect([unitOf('today'), unitOf('7d'), unitOf('30d'), unitOf('custom')]).toEqual(['today', 'week', 'month', 'range'])
  })
  it('writes a multiple the way the walkthrough does, and never a huge one', () => {
    expect([mult(21.4), mult(2.43), mult(5), mult(1.04)]).toEqual(['21×', '2.4×', '5×', '1×'])
    expect(mult(5000)).toBe('100×')
  })
  it('names the places people know by name', () => {
    expect(sourceName('news.ycombinator.com')).toBe('Hacker News')
    expect(sourceName('www.example.org')).toBe('example.org')
  })
})

describe('the sentence', () => {
  const ref: [string, number][] = [['news.ycombinator.com', 186], ['www.google.com', 20]]
  it('names the source, how many times the day before, and who paid', () => {
    const cur = result(300, { referrer: rows(ref), entry_page: rows([['/', 100]]) }, { money })
    const prev = result(100, { referrer: rows([['news.ycombinator.com', 30]]) })
    const s = say({ cur, prev, jump: topSource(cur, prev, 'x.com') })
    expect(s.lead).toBe('A busy Friday:')
    expect(text(s.long)).toBe('Hacker News brought 186 people, 6.2× the day before, and 1 person paid.')
    expect(s.long[0].em).toBe(true)
    expect(text(s.short)).toBe('Hacker News sent 6.2× the day before.')
  })
  it('says a multiple of the weekday usual when the server gives one', () => {
    const cur = result(300, {})
    const s = say({ cur, usual: { visitors: 300, average: 100, weeks: [{ day: 'x', visitors: 100 }] } })
    expect(text(s.long)).toBe('300 people came, 3× a usual Friday.')
  })
  it('never writes a huge multiple', () => {
    const cur = result(300, { referrer: rows(ref) })
    const prev = result(100, { referrer: rows([['news.ycombinator.com', 3]]) })
    const jump = (p: Result) => topSource(cur, p, 'x.com')
    expect(text(say({ cur, prev, jump: jump(prev) }).long)).toContain('62×')
    const tiny = result(100, { referrer: rows([['news.ycombinator.com', 1]]) })
    expect(text(say({ cur, prev: tiny, jump: jump(tiny) }).long)).not.toContain('186×')
  })
  it('does not name the site itself, or a source too small to name', () => {
    const own = result(100, { referrer: rows([['www.trckable.com', 90], ['a.com', 3]]) })
    expect(topSource(own, undefined, 'trckable.com')).toBeNull()
    expect(text(say({ cur: own, self: 'trckable.com', unit: 'month' }).long)).toBe("100 people came, right about what you'd expect.")
  })
  it('is slow, calm or bumpy by what the numbers did', () => {
    expect(say({ cur: result(40), prev: result(100) }).lead).toBe('A slow Friday:')
    expect(say({ cur: result(100), prev: result(100) }).lead).toBe('A calm Friday:')
    const bumpy = say({ cur: result(100), prev: result(100), downMin: 12 })
    expect(bumpy.lead).toBe('A bumpy Friday:')
    expect(text(bumpy.long)).toContain('It was down for 12 minutes.')
    expect(bumpy.bad).toBe(true)
  })
  it('says nobody came when nobody did', () => {
    const s = say({ cur: result(0), unit: 'yesterday' })
    expect(s.lead).toBe('Nobody came yesterday')
    expect(s.long).toEqual([])
    expect(text(s.short)).toBe('Nobody came yesterday.')
  })
  it('in the first week it learns, and says so', () => {
    const s = say({ cur: result(40), learning: true })
    expect(s.lead).toBe('Day one:')
    expect(text(s.long)).toBe('40 people so far.')
    expect(s.sub).toMatch(/learn your normal over 7 days/)
  })
  it('adds where most landed only when it is most of them', () => {
    expect(say({ cur: result(50, { entry_page: rows([['/pricing', 30]]) }), unit: 'month' }).sub).toBe('Most landed on /pricing.')
    expect(say({ cur: result(50, { entry_page: rows([['/pricing', 10]]) }), unit: 'month' }).sub).toBe('')
  })
})

describe('scores', () => {
  it('is 100 at usual or better, less below it, and nothing on a thin base', () => {
    expect(trafficScore(result(130), result(100))).toMatchObject({ value: 100, verdict: 'above', words: 'above normal' })
    expect(trafficScore(result(95), result(100))).toMatchObject({ value: 100, verdict: 'usual', words: 'normal' })
    expect(trafficScore(result(60), result(100))).toMatchObject({ value: 60, verdict: 'below', words: 'below normal' })
    expect(trafficScore(result(60), result(5))).toMatchObject({ value: null, verdict: 'none' })
  })
  it('engagement needs sessions on both sides', () => {
    expect(engagementScore(result(10), result(100)).value).toBeNull()
    expect(engagementScore(result(100), result(100))).toMatchObject({ verdict: 'usual', words: 'as usual' })
    const worse = { ...result(100), kpis: kpis({ visitors: 100, sessions: 100, bounce_rate: 0.8, avg_session_s: 30 }) }
    expect(engagementScore(worse, result(100))).toMatchObject({ verdict: 'below', words: 'more leave early' })
  })
  it('uptime is never fine while the site is down, and says so when its checks are off', () => {
    expect(uptimeScore({ pct: 100, downNow: true, downMin: 30, off: false })).toMatchObject({ value: 10, verdict: 'down', words: 'down 30 min' })
    expect(uptimeScore({ pct: 99.9, downNow: false, downMin: 2, off: false })).toMatchObject({ value: 94, verdict: 'lost', words: 'down 2 min' })
    expect(uptimeScore({ pct: 100, downNow: false, downMin: 0, off: false })).toMatchObject({ verdict: 'clear', words: 'no downtime' })
    expect(uptimeScore({ pct: null, downNow: false, downMin: 0, off: false }).value).toBeNull()
    expect(uptimeScore({ pct: 100, downNow: false, downMin: 0, off: true })).toMatchObject({ value: null, words: 'checks off' })
  })
  it('the ring weighs traffic 40, engagement 25 and uptime 35, is empty while down, and when nothing is known', () => {
    const t = trafficScore(result(130), result(100))
    const u = uptimeScore({ pct: 90, downNow: false, downMin: 60, off: false })
    expect(overall([t, u, engagementScore(result(1), result(1))])).toBe(65)
    expect(overall([t, uptimeScore({ pct: 100, downNow: true, downMin: 5, off: false })])).toBeNull()
    expect(overall([engagementScore(result(1), result(1))])).toBeNull()
  })
})

describe('the band', () => {
  const pts = (xs: number[]): Point[] => xs.map((visitors, i) => ({ t: `2026-10-16T0${i}:00`, visitors, pageviews: visitors }))
  it('counts the points above and below a quarter around the period before', () => {
    const b = bandOf(pts([10, 10, 40, 1]), pts([10, 10, 10, 10]))
    expect([b.above, b.below, b.total]).toEqual([1, 1, 4])
  })
  it('ends the line at the last hour with anyone in it', () => {
    expect(untilNow(pts([5, 6, 0, 0, 0])).map((p) => p.visitors)).toEqual([5, 6])
    expect(untilNow(pts([0, 0, 0])).length).toBe(2)
  })
  it('has no band without enough of the period before', () => {
    expect(bandOf(pts([1, 2, 3, 4]), pts([1])).hi).toEqual([])
  })
})

describe('the scores against the usual', () => {
  it('traffic keeps full marks above its band and loses them in proportion under it', () => {
    expect(trafficFromBand(150, { c: 100, lo: 80, hi: 120 })).toMatchObject({ value: 100, verdict: 'above', words: 'above normal' })
    expect(trafficFromBand(100, { c: 100, lo: 80, hi: 120 })).toMatchObject({ value: 100, verdict: 'usual' })
    expect(trafficFromBand(40, { c: 100, lo: 80, hi: 120 })).toMatchObject({ value: 20, verdict: 'below' })
  })
  it('engagement is as usual within a few points, and falls when more leave early', () => {
    expect(engagementFromBounce(0.45, 0.43, 100)).toMatchObject({ value: 100, words: 'as usual' })
    expect(engagementFromBounce(0.6, 0.43, 100)).toMatchObject({ verdict: 'below', words: 'more leave early' })
    expect(engagementFromBounce(0.6, null, 100).value).toBeNull()
  })
  it('says a site that is not answering before anything else', () => {
    const r = say({ cur: result(327), self: 'shop.dev', downMin: 30, ongoing: { since: '11:40', minutes: 30 } })
    expect(r.lead).toBe("shop.dev isn't answering.")
    expect(r.long.map((p) => p.t).join('')).toBe(' It went quiet at 11:40, 30 minutes ago.')
    expect(r).toMatchObject({ bad: true, own: true, sub: "Visitors can't reach it, so everything below stops at 11:40." })
  })
  it('says a stretch of downtime with the people so far', () => {
    const r = say({ cur: result(469), self: 'shop.dev', downMin: 23, incidents: [{ from: '11:40', to: '12:03', minutes: 23 }], lost: 30 })
    expect(r.lead).toBe('shop.dev was down for 23 minutes')
    expect(r.long.map((p) => p.t).join('')).toBe(', 11:40 to 12:03. 469 people so far.')
    expect(r.sub).toBe('About 30 people would normally have visited in that time.')
  })
})
