import { describe, expect, it } from 'vitest'
import type { KPIs, Result, Row } from '../../lib/api'
import { biggestLoss, leavesFastest, stateOf, storyOf, tiles, type Input } from './rules'

const kpis = (o: Partial<KPIs> = {}): KPIs => ({ visitors: 1000, sessions: 1100, pageviews: 3000, bounce_rate: 0.4, avg_session_s: 120, views_per_session: 2.7, new_visitor_share: 0.5, ...o })
const rows = (r: [string, number, number?][]): Row[] => r.map(([value, visitors, bounce_rate]) => ({ value, visitors, bounce_rate }))
const result = (k: Partial<KPIs>, channel: [string, number, number?][] = [], extra: Partial<Result> = {}): Result => ({
  approximate: false, kpis: kpis(k), series: [], dims: { channel: rows(channel), entry_page: [] }, goals: null, ...extra,
})

const grew: Input = { cur: result({ visitors: 14000 }, [['Search', 9000, 0.5], ['Paid', 3000, 0.9]]), prev: result({ visitors: 4000 }), goals: false }

describe('state', () => {
  it('is new for little data and nothing before', () => {
    expect(stateOf({ cur: result({ visitors: 3, sessions: 3 }), goals: false })).toBe('new')
  })
  it('is quiet inside 10% of the period before', () => {
    expect(stateOf({ cur: result({ visitors: 1050 }), prev: result({ visitors: 1000 }), goals: false })).toBe('quiet')
  })
  it('is moving past it', () => {
    expect(stateOf(grew)).toBe('moving')
  })
})

describe('headline', () => {
  it('names the growth, the top source and the worst number from the report', () => {
    const h = storyOf(grew).headline
    expect(h.strong).toBe('14,000 people')
    expect(h.post).toContain('250% more than the period before')
    expect(h.post).toContain('Search sent 64% of them')
  })
  it('names where a drop came from', () => {
    const i: Input = { cur: result({ visitors: 500 }, [['Direct', 500]]), prev: result({ visitors: 1000 }, [['Search', 600], ['Direct', 400]]), goals: false }
    expect(biggestLoss(i)?.value).toBe('Search')
    expect(storyOf(i).headline.post).toContain('50% fewer')
    expect(storyOf(i).headline.post).toContain('Most of the drop is Search')
  })
  it('says "so far" for a new site', () => {
    const h = storyOf({ cur: result({ visitors: 3, sessions: 3 }), goals: false }).headline
    expect(h.pre + h.strong + h.post).toBe('Your story starts here. 3 visitors so far.')
  })
  it('never uses an em dash', () => {
    const s = storyOf(grew)
    expect(JSON.stringify(s)).not.toContain('—')
  })
})

describe('tiles', () => {
  it('judges the visitors against the period before', () => {
    expect(tiles(grew)[0].verdict).toBe('Far above your normal (4,000 before)')
  })
  it('flags a high bounce rate', () => {
    const t = tiles({ cur: result({ bounce_rate: 0.79 }), prev: result({}), goals: false })[1]
    expect(t.tone).toBe('warn')
    expect(t.verdict).toBe('High: 8 in 10 read one page and go')
  })
  it('does not count revenue it may not show', () => {
    const t = tiles(grew)[3]
    expect(t.connect).toBe(true)
    expect(t.value).toBe('not counted')
  })
  it('compares with nothing when there is no period before', () => {
    expect(tiles({ cur: result({}), goals: false })[0].verdict).toBe('No earlier period to compare with yet')
  })
})

describe('answers', () => {
  it('finds the source whose visitors leave fastest', () => {
    const f = leavesFastest(grew)
    expect(f?.worst.value).toBe('Paid')
    expect(f?.best?.value).toBe('Search')
  })
  it('says nothing needs fixing when no source stands out', () => {
    const i: Input = { cur: result({}, [['Search', 600, 0.4], ['Direct', 400, 0.45]]), prev: result({}), goals: false }
    expect(storyOf(i).answers[2].look).toBe('quiet')
  })
  it('says money is not known without sales or goals', () => {
    const a = storyOf(grew).answers[3]
    expect(a.line).toBe('Not known yet: no sales or sign-ups are counted.')
    expect(a.connect).toBe(true)
  })
  it('gives each button the filters Explore opens with', () => {
    const a = storyOf(grew).answers
    expect(a[0].act?.filters).toEqual([{ dim: 'channel', value: 'Search' }])
    expect(a[2].act?.filters).toEqual([{ dim: 'channel', value: 'Paid' }])
    expect(a[4].act?.compare).toBe(true)
  })
  it('names the worse numbers in the verdict', () => {
    expect(storyOf({ cur: result({ visitors: 2000, bounce_rate: 0.9 }), prev: result({ visitors: 1000 }), goals: false }).answers[4].line).toBe('Mostly good. Only bounce rate is worse than before.')
  })
})
