import { describe, expect, it } from 'vitest'
import type { Result } from '../../lib/api'
import { calmTopics, cardsOf, movers, type CardsIn, type Slice } from './cards'

const kpis = (v: number): Result['kpis'] => ({ visitors: v, sessions: v, pageviews: v, bounce_rate: 0.5, avg_session_s: 60, views_per_session: 2, new_visitor_share: 0.5 })
const cur = (v: number, extra: Partial<Result> = {}): Result => ({ approximate: false, kpis: kpis(v), series: [], dims: {}, goals: null, ...extra })
const slice = (value: string, v: number, c: number | null): Slice => ({ value, name: value, v, band: c === null ? null : { c, lo: c * 0.8, hi: c * 1.2 }, bounce: 0.66 })
const base = (o: Partial<CardsIn> = {}): CardsIn => ({
  domain: 'trckable.com',
  cur: cur(900),
  unit: 'today',
  weekday: 'Friday',
  learning: false,
  low: false,
  slices: { referrer: [], country: [], device: [], entry_page: [] },
  goals: [],
  rule: 'Compared with the last 4 Fridays, up to 16:30.',
  uptime: { downNow: false, since: '', minutesNow: 0, incidents: [], minutes: 0, lost: 0, spans: [], nowAt: 0.7, from: '00:00', now: '16:30' },
  ...o,
})

describe('the movers', () => {
  it('keeps the slices that left their band by enough to matter', () => {
    const list = [slice('a', 150, 8), slice('b', 100, 100), slice('c', 5, 3), slice('d', 20, null)]
    expect(movers(list, 900).map((m) => m.value)).toEqual(['a'])
  })
})

describe('the cards', () => {
  it('writes a source that jumped as a claim, its dots in its colour, and a link to share', () => {
    const list = cardsOf(base({ slices: { referrer: [slice('news.ycombinator.com', 186, 9)], country: [], device: [], entry_page: [] }, topPageOf: () => ({ name: '/', value: '/' }) }))
    expect(list).toHaveLength(1)
    const c = list[0]
    expect(c).toMatchObject({ key: 'sources', head: 'Hacker News sent 186 people', rest: ', 21× your usual' })
    expect(c.vis).toMatchObject({ k: 'dots' })
    expect(c.act).toMatchObject({ k: 'copy', t: 'Share the link that worked' })
    expect(c.why).toContain('most landed on /')
    expect(c.why).toContain('66% leave after one page')
  })
  it('a source far under its usual is red, with two bars, and an alert to set', () => {
    const c = cardsOf(base({ slices: { referrer: [slice('google.com', 10, 100)], country: [], device: [], entry_page: [] } }))[0]
    expect(c).toMatchObject({ bad: true, rest: ', far below usual' })
    expect(c.vis).toMatchObject({ k: 'ba', red: true })
    expect(c.act?.k).toBe('set')
  })
  it('a country that came in more than usual is a number with a line and its main source', () => {
    const c = cardsOf(base({ slices: { referrer: [], country: [slice('US', 309, 230)], device: [], entry_page: [] }, topSourceOf: () => 'Google' }))[0]
    expect(c.kc).toMatchObject({ label: 'United States', note: 'more than usual', tone: 'up' })
    expect(c.why).toMatch(/^Google sends most of them\. Usually \d+–\d+ people from United States\.$/)
  })
  it('a site that is down has one card, red, and nothing else', () => {
    const list = cardsOf(base({ slices: { referrer: [slice('news.ycombinator.com', 186, 9)], country: [], device: [], entry_page: [] }, uptime: { ...base().uptime, downNow: true, since: '11:40', minutesNow: 5, minutes: 5 } }))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ key: 'uptime', bad: true, head: 'trckable.com stopped answering at 11:40', rest: ', 5 minutes ago' })
  })
  it('says nothing of changes while the site is still learning its normal', () => {
    expect(cardsOf(base({ learning: true, slices: { referrer: [slice('news.ycombinator.com', 186, 9)], country: [], device: [], entry_page: [] } }))).toEqual([])
  })
  it('a mention of the day and slower pages get their cards', () => {
    const list = cardsOf(base({ mention: { host: 'Hacker News', title: 'Show HN: X', at: '14:05', points: 214, comments: 58, page: '/' }, speed: { cur: [3.4, 243, 0.09], usual: [2.1, 180, 0.05] } }))
    expect(list.map((c) => c.key)).toEqual(['mentions', 'speed'])
    expect(list[1]).toMatchObject({ bad: true, head: 'Pages got slower', rest: ': loading takes 3.4 s, usually 2.1 s' })
  })
  it('ranks the worse news and the bigger change first', () => {
    const list = cardsOf(base({ slices: { referrer: [slice('news.ycombinator.com', 186, 9)], country: [slice('US', 309, 230)], device: [], entry_page: [] }, mention: { host: 'Hacker News', title: 't', at: '14:05', points: 1, comments: 1, page: '/' } }))
    expect(list.map((c) => c.key)).toEqual(['sources', 'mentions', 'countries'])
  })
})

describe('the quiet line', () => {
  it('names what has no card, and leaves out search when it is not connected', () => {
    const cards = cardsOf(base({ slices: { referrer: [slice('news.ycombinator.com', 186, 9)], country: [], device: [], entry_page: [] } }))
    expect(calmTopics(cards, false)).toEqual(['devices', 'countries', 'pages', 'goals'])
    expect(calmTopics(cards, true)).toContain('search')
  })
  it('tells a goal against its own usual, not against a whole day before', () => {
    const [g] = cardsOf(base({ goals: [slice('signed-up', 30, 31)] })).filter((x) => x.key === 'goals')
    expect(g).toBeUndefined()
    const down = cardsOf(base({ goals: [slice('signed-up', 10, 31)] })).find((x) => x.key === 'goals')
    expect(down?.bad).toBe(true)
  })
})
