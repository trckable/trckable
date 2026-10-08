import { describe, expect, it } from 'vitest'
import type { KPIs, Result, Row } from '../../lib/api'
import { biggestLoss, deltaOf, hintsOf, leavesFastest, sinceOf, stateOf, storyOf, takeawayOf, tiles, type Input } from './rules'

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

describe('thin data', () => {
  const few = { cur: result({ visitors: 1, sessions: 1, bounce_rate: 1, avg_session_s: 0 }), goals: false }
  it('shows a dash and no verdict for rates and averages of a handful of visits', () => {
    const t = tiles(few)
    expect(t.find((x) => x.key === 'bounce')).toMatchObject({ value: '–', verdict: 'Too few visits yet', tone: 'flat' })
    expect(t.find((x) => x.key === 'session')).toMatchObject({ value: '–', verdict: 'Too few visits yet' })
    expect(t.find((x) => x.key === 'visitors')?.move).toBeUndefined()
  })
  it('says the fix answer is not ready, and counts one visitor in the singular', () => {
    const a = storyOf(few).answers
    expect(a.find((x) => x.key === 'fix')).toMatchObject({ line: 'Not enough visits yet.', big: '–' })
    expect(a.find((x) => x.key === 'did')?.line).toContain('1 visitor so far')
  })
  it('caps a change over ten times the earlier figure', () => {
    expect(deltaOf(1500, 100)).toMatchObject({ capped: true, arrow: '↑' })
    expect(deltaOf(900, 100)?.capped).toBeUndefined()
    const i: Input = { cur: result({ visitors: 5000 }, [['Search', 5000]]), prev: result({ visitors: 100 }), goals: false }
    expect(takeawayOf(i)).toContain('Up more than 10x on the period before')
  })
  it('measures no change against an earlier period of fewer than 20 visitors', () => {
    const i: Input = { cur: result({ visitors: 500 }), prev: result({ visitors: 8, sessions: 8 }), goals: false }
    expect(tiles(i)[0].move).toBeUndefined()
    expect(tiles(i)[0].verdict).toBe('No earlier period to compare with yet')
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
  it('tells the move as a delta, a lower bounce rate being the good one', () => {
    expect(tiles(grew)[0].move?.arrow).toBe('↑')
    const t = tiles({ cur: result({ bounce_rate: 0.4 }), prev: result({ bounce_rate: 0.6 }), goals: false })[1]
    expect(t.move).toMatchObject({ arrow: '↓', tone: 'good' })
  })
  it('says one word for how the period went', () => {
    expect(storyOf({ cur: result({}), goals: false }).answers[4].word?.text).toBe('Too early')
    expect(storyOf({ cur: result({ visitors: 5000 }), prev: result({}), goals: false }).answers[4].word?.tone).toBe('good')
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

describe('takeaway and deltas', () => {
  const goal = (n: number): Row[] => [{ value: 'Signup', visitors: n }]
  it('names the change, the driving source and whether goals followed', () => {
    const i: Input = {
      cur: result({ visitors: 1240 }, [['Search', 900], ['Direct', 340]], { goals: goal(30) }),
      prev: result({ visitors: 1000 }, [['Search', 700], ['Direct', 300]], { goals: goal(20) }),
      goals: true,
    }
    expect(takeawayOf(i)).toBe('Up 24% on the period before, mostly from Search. Signup followed.')
  })
  it('names no source that explains under half the move, and says when goals did not follow', () => {
    const i: Input = {
      cur: result({ visitors: 1300 }, [['Search', 800], ['Direct', 500]], { goals: goal(10) }),
      prev: result({ visitors: 1000 }, [['Search', 600], ['Direct', 400]], { goals: goal(20) }),
      goals: true,
    }
    expect(takeawayOf(i)).toBe('Up 30% on the period before, mostly from Search. Signup did not follow.')
    const mixed: Input = { cur: result({ visitors: 1300 }, [['Search', 700], ['Direct', 600], ['Paid', 0]]), prev: result({ visitors: 1000 }, [['Search', 600], ['Direct', 500], ['Paid', 100]]), goals: false }
    expect(takeawayOf(mixed)).toBe('Up 30% on the period before.')
  })
  it('adds the one cause that explains half the move: a page, a referrer, a campaign or a country', () => {
    const base = (cur: Partial<Result>, prev: Partial<Result> = {}): Input => ({
      cur: result({ visitors: 200 }, [['Search', 200]], { dims: { channel: rows([['Search', 200]]), ...cur.dims } }),
      prev: result({ visitors: 100 }, [['Search', 100]], { dims: { channel: rows([['Search', 100]]), ...prev.dims } }),
      goals: false,
    })
    const page = base({ dims: { entry_page: rows([['/news', 160], ['/', 40]]) } }, { dims: { entry_page: rows([['/news', 20], ['/', 80]]) } })
    expect(takeawayOf(page)).toBe('Up 100% on the period before, mostly from Search, most of it on /news.')
    const ref = base({ dims: { referrer: rows([['facebook.com', 90], ['', 110]]) } }, { dims: { referrer: rows([['', 100]]) } })
    expect(takeawayOf(ref)).toBe('Up 100% on the period before, mostly from Search, most of it from facebook.com.')
    const camp = base({ dims: { campaign: rows([['spring', 80], ['', 120]]) } }, { dims: { campaign: rows([['', 100]]) } })
    expect(takeawayOf(camp)).toContain('most of it from the spring campaign.')
    const ctry = base({ dims: { country: rows([['XK', 120], ['AL', 80]]) } }, { dims: { country: rows([['AL', 100]]) } })
    expect(takeawayOf(ctry)).toContain('most of it from Kosovo.')
    // google.com under Search only repeats the channel: the next best cause is told instead, or none.
    const eng = base({ dims: { referrer: rows([['google.com', 200]]), country: rows([['XK', 120], ['AL', 80]]) } }, { dims: { referrer: rows([['google.com', 100]]), country: rows([['AL', 100]]) } })
    expect(takeawayOf(eng)).toBe('Up 100% on the period before, mostly from Search, most of it from Kosovo.')
    expect(takeawayOf(base({ dims: { referrer: rows([['google.com', 200]]) } }, { dims: { referrer: rows([['google.com', 100]]) } }))).toBe('Up 100% on the period before, mostly from Search.')
    // The country moved 100, the page 60: the biggest one is told, once.
    const both = base({ dims: { country: rows([['XK', 120], ['AL', 80]]), entry_page: rows([['/a', 80], ['/b', 120]]) } }, { dims: { country: rows([['AL', 100]]), entry_page: rows([['/a', 60], ['/b', 40]]) } })
    expect(takeawayOf(both).match(/most of it/g)).toHaveLength(1)
  })
  it('adds no cause when nothing explains half the move or the move is tiny', () => {
    const spread = { cur: result({ visitors: 200 }, [['Search', 200]], { dims: { channel: rows([['Search', 200]]), entry_page: rows([['/a', 50], ['/b', 50], ['/c', 50], ['/d', 50]]) } }), prev: result({ visitors: 100 }, [['Search', 100]], { dims: { channel: rows([['Search', 100]]), entry_page: rows([['/a', 25], ['/b', 25], ['/c', 25], ['/d', 25]]) } }), goals: false }
    expect(takeawayOf(spread)).toBe('Up 100% on the period before, mostly from Search.')
    const tiny = { cur: result({ visitors: 10 }, [['Search', 10]], { dims: { channel: rows([['Search', 10]]), entry_page: rows([['/a', 10]]) } }), prev: result({ visitors: 6 }, [['Search', 6]], { dims: { channel: rows([['Search', 6]]), entry_page: rows([['/a', 6]]) } }), goals: false }
    // Six visitors before is no base for a percentage (lib/thin): nothing is said.
    expect(takeawayOf(tiny)).toBe('')
  })
  it('says about the same within 5% and nothing without a period before', () => {
    expect(takeawayOf({ cur: result({ visitors: 1030 }), prev: result({ visitors: 1000 }), goals: false })).toBe('About the same as the period before.')
    expect(takeawayOf({ cur: result({ visitors: 1030 }), goals: false })).toBe('')
  })
  it('reads bounce going up as bad and a small move as flat', () => {
    expect(deltaOf(0.5, 0.4, 'down')).toMatchObject({ arrow: '↑', pct: 25, tone: 'bad' })
    expect(deltaOf(120, 100)).toMatchObject({ arrow: '↑', tone: 'good' })
    expect(deltaOf(101, 100)).toMatchObject({ arrow: '→', tone: 'flat' })
    expect(deltaOf(5, undefined)).toBeNull()
  })
  it('puts an arrow on the first answer only when there is a period before', () => {
    expect(storyOf(grew).answers[0].delta).toMatchObject({ arrow: '↑', pct: 250 })
    expect(storyOf({ cur: result({ visitors: 500 }), goals: false }).answers[0].delta).toBeUndefined()
  })
})

describe('since the last visit', () => {
  it('says nothing without a finding', () => {
    expect(sinceOf([], () => '')).toBeUndefined()
  })
})

describe('hints', () => {
  const kept: { done: ('ai' | 'crawlers')[] } = { done: [] }
  const know = { ai: null, crawlersOff: false, heat: null, owner: true }
  const day = '2026-10-07'
  it('hangs the AI visitor on the sources answer, until it is put away', () => {
    expect(hintsOf({ ...know, ai: 'visitor' }, kept, false, day)).toEqual([{ id: 'ai', answer: 'did', ai: 'visitor' }])
    expect(hintsOf({ ...know, ai: 'visitor', crawlersOff: true }, { done: ['ai'] }, false, day)).toEqual([{ id: 'crawlers', answer: 'did' }])
    expect(hintsOf({ ...know, ai: 'visitor' }, { done: ['ai'] }, false, day)).toEqual([])
  })
  it('hangs the heatmap on the page answer', () => {
    expect(hintsOf({ ...know, heat: { ask: true, path: '/pricing', views: 412 } }, kept, false, day)).toEqual([{ id: 'heat', answer: 'page', path: '/pricing', views: 412 }])
    expect(hintsOf({ ...know, heat: { ask: true, path: '/pricing' } }, kept, true, day)).toEqual([])
  })
  it('waits for what it hangs on and is for an owner only', () => {
    expect(hintsOf({ ...know, ai: undefined }, kept, false, day)).toEqual([])
    expect(hintsOf({ ...know, ai: 'visitor', owner: false }, kept, false, day)).toEqual([])
  })
})
