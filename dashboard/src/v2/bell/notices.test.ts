import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/api'
import type { FeedRow } from './feed'
import { GOAL_CAP, arrange, badge, fromFeed, rowsOf, settle, unreadCount, withFeed, type Notice } from './notices'

const n = (id: string, at: number, kind: Notice['kind'] = 'down'): Notice => ({ id, kind, site: 'a.com', title: id, sub: '', at })

describe('the bell list', () => {
  it('puts the newest first, drops repeats and what has not happened yet', () => {
    const now = 10_000_000
    const out = arrange([n('a', now - 100), n('b', now - 10), n('a', now - 100), n('later', now + 3600)], now)
    expect(out.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('counts what is unread and caps the badge', () => {
    expect(unreadCount(rowsOf([n('a', 1), n('b', 2)], new Set(['a'])))).toBe(1)
    expect(badge(12)).toBe('9+')
  })

  it('has a badge that is always the number of unread rows listed, whatever the mix', () => {
    const list = [n('a', 5), { ...n('b', 4), seen: true }, n('c', 3, 'mention'), n('d', 2, 'milestone')]
    for (const read of [new Set<string>(), new Set(['a']), new Set(['a', 'c', 'zz']), new Set(['a', 'c', 'd'])]) {
      const rows = rowsOf(list, read)
      expect(unreadCount(rows)).toBe(rows.filter((r) => r.unread).length)
      expect(rows.map((r) => r.id)).toEqual(list.map((x) => x.id))
      expect(rows.find((r) => r.id === 'b')?.unread).toBe(false)
    }
  })
})

describe('the bell with a build’s own feed', () => {
  it('is the site’s own list when there is no feed', () => {
    const own = [n('a', 5)]
    expect(withFeed(own, undefined)).toBe(own)
    expect(withFeed(own, [])).toBe(own)
  })

  it('leaves out the site’s surges and milestones where the feed tells that kind, and repeats of an id', () => {
    const own = [n('d', 9), n('s', 8, 'spike'), n('m', 7, 'milestone'), n('x', 6, 'mention')]
    const out = withFeed(own, [n('fs', 10, 'spike'), n('fm', 5, 'milestone'), n('x', 6, 'mention')])
    expect(out.map((o) => o.id)).toEqual(['fs', 'd', 'x', 'fm'])
  })

  it('keeps the site’s own milestones when the feed has none of that kind', () => {
    expect(withFeed([n('m', 7, 'milestone')], [n('p', 3, 'plan')]).map((o) => o.id)).toEqual(['m', 'p'])
  })
})

describe('the rows of an open bell', () => {
  const row = (id: string, at: number, unread = true) => ({ ...n(id, at), unread })

  it('keeps notices of one second in one order whatever order they arrive in', () => {
    const now = 10_000_000
    const a = arrange([n('x', now - 5), n('y', now - 5)], now).map((r) => r.id)
    const b = arrange([n('y', now - 5), n('x', now - 5)], now).map((r) => r.id)
    expect(a).toEqual(b)
  })

  it('puts a new row on top and moves nothing else', () => {
    const shown = [row('b', 20), row('a', 10)]
    expect(settle(shown, [row('c', 30), ...shown], new Set()).map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('keeps a row that left the list as read, and drops one put away', () => {
    const shown = [row('b', 20), row('a', 10)]
    const out = settle(shown, [row('a', 10)], new Set())
    expect(out.map((r) => [r.id, r.unread])).toEqual([['b', false], ['a', true]])
    expect(settle(shown, [row('a', 10)], new Set(['b'])).map((r) => r.id)).toEqual(['a'])
  })
})

describe('busy moments of several sites at the same time', () => {
  const busy = (id: string, site: string, at: number): Notice => ({ id, kind: 'spike', site, title: id, sub: '', at })

  it('are one row naming how many, newest first, unread while any of them is', () => {
    const rows = rowsOf([busy('a', 'a.com', 1000), busy('b', 'b.com', 900), n('d', 800)], new Set(['a']))
    expect(rows.map((r) => r.id)).toEqual(['busy:a', 'd'])
    expect(rows[0].title).toBe('2 sites are busy')
    expect(rows[0].members?.map((m) => m.site)).toEqual(['a.com', 'b.com'])
    expect(rows[0].unread).toBe(true)
    expect(rowsOf([busy('a', 'a.com', 1000), busy('b', 'b.com', 900)], new Set(['a', 'b']))[0].unread).toBe(false)
  })

  it('stay apart when far apart in time, or when it is one site twice', () => {
    expect(rowsOf([busy('a', 'a.com', 5000), busy('b', 'b.com', 1000)], new Set()).map((r) => r.id)).toEqual(['a', 'b'])
    expect(rowsOf([busy('a', 'a.com', 1000), busy('b', 'a.com', 900)], new Set()).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('keep a site to its newest in the row and the order of every other row', () => {
    const rows = rowsOf([busy('a', 'a.com', 1000), busy('a2', 'a.com', 950), busy('b', 'b.com', 900), n('x', 990)], new Set())
    expect(rows.map((r) => r.id)).toEqual(['busy:a', 'x', 'a2'])
    expect(rows[0].members?.map((m) => m.id)).toEqual(['a', 'b'])
  })
})

const sites = [{ id: 's1', domain: 'a.com' }, { id: 's2', domain: 'b.com' }] as Site[]
const row = (r: Partial<FeedRow> & Pick<FeedRow, 'id' | 'kind'>): FeedRow => ({ site: 's1', at: 1_000_000, ...r })
const now = 1_000_100

describe('the cap', () => {
  it('lists 40 rows and every site that is down besides', () => {
    const t = 10_000_000
    const many = Array.from({ length: 50 }, (_, i) => n(`x${i}`, t - 10 - i, 'mention'))
    const out = arrange([...many, n('down:old', t - 6 * 86400, 'down')], t)
    expect(out).toHaveLength(41)
    expect(out.at(-1)?.id).toBe('down:old')
    expect(withFeed(out, [n('p', t - 1, 'plan')]).some((x) => x.id === 'down:old')).toBe(true)
  })
})

describe('the server’s list as the bell’s rows', () => {
  it('keeps one id for a site that was down, red while it goes on and calm with its span once it is back', () => {
    const [going] = fromFeed([row({ id: 'down:i1', kind: 'down', at: now - 600 })], sites, now)
    expect(going).toMatchObject({ id: 'down:i1', kind: 'down', bad: true, at: now - 600, site: 'a.com', siteId: 's1' })
    expect(going.title).toMatch(/^a\.com down since \d\d:\d\d$/)
    const [over] = fromFeed([row({ id: 'down:i1', kind: 'down', at: now - 900, ended: now - 300 })], sites, now)
    expect(over).toMatchObject({ id: 'down:i1', kind: 'up', at: now - 900 })
    expect(over.title).toBe('a.com was down 10m')
    expect(over.when).toMatch(/^\d\d:\d\d–\d\d:\d\d$/)
    expect(fromFeed([row({ id: 'down:i1', kind: 'down', at: now - 60, ended: now + 60 })], sites, now)[0].kind).toBe('down')
  })

  it('writes a row’s time in the site’s zone, as Live does', () => {
    const at = Date.UTC(2026, 9, 18, 17, 27) / 1000
    const berlin = [{ id: 's1', domain: 'a.com', timezone: 'Europe/Berlin' }] as Site[]
    const utc = [{ id: 's1', domain: 'a.com', timezone: 'UTC' }] as Site[]
    expect(fromFeed([row({ id: 'd', kind: 'down', at })], utc, at + 60)[0]).toMatchObject({ zone: 'UTC', title: 'a.com down since 17:27' })
    expect(fromFeed([row({ id: 'd', kind: 'down', at })], berlin, at + 60)[0].title).toBe('a.com down since 19:27')
  })

  it('leaves out a row of a site the person does not have', () => {
    expect(fromFeed([row({ id: 'x', kind: 'mention', site: 'zz' })], sites, now)).toEqual([])
  })

  it('tells a busy spell with its source and a short line of facts', () => {
    const [surge] = fromFeed([row({ id: 'busy:surge:1', kind: 'busy', what: 'surge', visitors: 38, factor: 1.8, source: 'l.facebook.com' })], sites, now)
    expect(surge).toMatchObject({ kind: 'spike', source: 'l.facebook.com', title: 'a.com is busy', sub: '38 online · 1.8× usual', busy: { visitors: 38, factor: 1.8 } })
    expect(fromFeed([row({ id: 'busy:spike:1', kind: 'busy', what: 'spike', visitors: 120, factor: 3.2 })], sites, now)[0].sub).toBe('120 people · 3.2× usual')
  })

  it('puts a daily milestone under its day, all day, whatever hour the server found it', () => {
    const m = { kind: 'visitors', step: '100', value: 100, day: '2026-10-30', created_at: 1_700_000_999, new: true, shared: false } as never
    const zoned = [{ id: 's1', domain: 'a.com', timezone: 'UTC' }] as Site[]
    const [n] = fromFeed([row({ id: 'mile:s1:visitors:100', kind: 'milestone', at: 1_700_000_000, day: '2026-10-30', milestone: m })], zoned, now)
    expect(n.day).toBe('2026-10-30')
    expect(n.at).toBe(Date.parse('2026-10-30T00:00:00Z') / 1000)
    expect(n.at).not.toBe(1_700_000_999)
  })

  it('keeps a milestone where it sits whether the sites are known yet or not (no jump when they arrive)', () => {
    const m = { kind: 'visitors', step: '100', value: 100, day: '2026-10-30', created_at: 1, new: true, shared: false } as never
    const server = Date.parse('2026-10-29T23:00:00Z') / 1000 // the site's midnight, as the server sends it
    const r = row({ id: 'mile:s1:visitors:100', kind: 'milestone', at: server, day: '2026-10-30', milestone: m, domain: 'a.com' })
    const before = fromFeed([r], [], now)[0]
    const after = fromFeed([r], [{ id: 's1', domain: 'a.com', timezone: 'Europe/Berlin' }] as Site[], now)[0]
    expect(before.at).toBe(after.at)
  })

  it('lists notices of the same second in one order however the list came, and again after a re-read', () => {
    const ids = ['c', 'a', 'B', 'a10', 'a2', 'b']
    const rows = ids.map((id) => n(id, 500))
    const once = arrange(rows, 1000).map((x) => x.id)
    expect(arrange([...rows].reverse(), 1000).map((x) => x.id)).toEqual(once)
    expect(arrange(arrange(rows, 1000), 1000).map((x) => x.id)).toEqual(once)
    expect(rowsOf(arrange(rows, 1000), new Set()).map((x) => x.id)).toEqual(once)
    expect(once).toEqual([...ids].sort())
  })

  it('never tells a goal without its number, and keeps one milestone of a family and day', () => {
    const [g] = fromFeed([row({ id: 'goal:s1:dl:d', kind: 'goal', count: 126, text: 'file_download' })], sites, now)
    expect(g.title).toBe('File download: 126')
    const m = (value: number) => ({ kind: 'visitors', step: String(value), value, day: '2026-10-30', created_at: 1, new: true, shared: false }) as never
    const out = fromFeed([row({ id: 'mile:s1:visitors:100', kind: 'milestone', day: '2026-10-30', milestone: m(100) }), row({ id: 'mile:s1:visitors:1000', kind: 'milestone', day: '2026-10-30', milestone: m(1000) })], sites, now)
    expect(out.map((n) => n.id)).toEqual(['mile:s1:visitors:1000'])
  })

  it('tells sales, signups and goals of an hour as one row with their count', () => {
    const out = fromFeed([row({ id: 'sale:s1:h', kind: 'sale', count: 3, amount: 4500, currency: 'USD', exponent: 2 }), row({ id: 'signup:s1:h', kind: 'signup', count: 2 }), row({ id: 'goal:s1:g:h', kind: 'goal', count: 1, text: 'Newsletter' })], sites, now)
    expect(out.map((r) => r.title)).toEqual(['3 sales', '2 new signups', 'Newsletter: 1'])
    expect(out[0].sub).toContain('45')
  })

  it('tells a fired alert by its kind and a mention by the host that posted it', () => {
    const out = fromFeed([row({ id: 'alert:1', kind: 'alert', what: 'disk' }), row({ id: 'alert:2', kind: 'alert', what: 'weekly' }), row({ id: 'mention:1', kind: 'mention', source: 'hn', host: 'news.ycombinator.com', text: 'T' })], sites, now)
    expect(out.map((r) => [r.kind, r.alert])).toEqual([['alert', 'disk'], ['mention', undefined]])
    expect(out[1].source).toBe('news.ycombinator.com')
  })

  it('tells Answers changes, the first time with its own words, and a budget that ran out at its own time', () => {
    const out = fromFeed(
      [row({ id: 'a1', kind: 'answer', what: 'dropped', engine: 'openai', text: 'best analytics' }), row({ id: 'a2', kind: 'answer', what: 'seen', engine: 'anthropic', first: true }), row({ id: 'a3', kind: 'answer', what: 'paused', site: '', at: now - 5000 })],
      sites,
      now,
    )
    expect(out.map((r) => r.title)).toEqual(['ChatGPT stopped naming you for “best analytics”', 'Peekaboo. Claude just named you.', 'Paused until the 1st: this month’s budget is used.'])
    expect(out[2].at).toBe(now - 5000)
    expect(out[0].open).toBeUndefined()
  })
})

describe('busy moments of several sites at the same time', () => {
  const busy = (id: string, site: string, at: number): Notice => ({ id, kind: 'spike', site, title: id, sub: '', at })

  it('are one row naming how many, newest first, unread while any of them is', () => {
    const rows = rowsOf([busy('a', 'a.com', 1000), busy('b', 'b.com', 900), n('d', 800)], new Set(['a']))
    expect(rows.map((r) => r.id)).toEqual(['busy:a', 'd'])
    expect(rows[0].title).toBe('2 sites are busy')
    expect(rows[0].members?.map((m) => m.site)).toEqual(['a.com', 'b.com'])
    expect(rows[0].unread).toBe(true)
    expect(rowsOf([busy('a', 'a.com', 1000), busy('b', 'b.com', 900)], new Set(['a', 'b']))[0].unread).toBe(false)
  })

  it('stay apart when far apart in time, or when it is one site twice', () => {
    expect(rowsOf([busy('a', 'a.com', 5000), busy('b', 'b.com', 1000)], new Set()).map((r) => r.id)).toEqual(['a', 'b'])
    expect(rowsOf([busy('a', 'a.com', 1000), busy('b', 'a.com', 900)], new Set()).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('keep a site to its newest in the row and the order of every other row', () => {
    const rows = rowsOf([busy('a', 'a.com', 1000), busy('a2', 'a.com', 950), busy('b', 'b.com', 900), n('x', 990)], new Set())
    expect(rows.map((r) => r.id)).toEqual(['busy:a', 'x', 'a2'])
    expect(rows[0].members?.map((m) => m.id)).toEqual(['a', 'b'])
  })
})

describe('the goals row', () => {
  const sites1 = [{ id: 's1', domain: 'a.com' }] as Site[]
  const at = 1_000_000

  it('is one row that sums the day’s goals, at the time of the latest goal', () => {
    const goals = [
      { goal: 'outbound_click', count: 131 },
      { goal: 'form_submit', count: 816 },
    ]
    const [g] = fromFeed([{ id: 'goal:s1:2026-11-10:2', kind: 'goal', site: 's1', at: at - 7, count: 947, goals }], sites1, at)
    expect(g.title).toBe('Goals: 131 Outbound clicks · 816 Form submissions')
    expect(g.at).toBe(at - 7)
  })

  it('has a cap of its own: a sale and a site that is down stay listed among 100 goal rows', () => {
    const goal = (i: number): Notice => n(`goal:${i}`, at - i, 'goal')
    const list = [...Array.from({ length: 100 }, (_, i) => goal(i)), n('sale:1', at - 500, 'sale'), n('down:1', at - 600)]
    const out = arrange(list, at)
    expect(out.filter((x) => x.kind === 'goal')).toHaveLength(GOAL_CAP)
    expect(out.map((x) => x.id)).toEqual(expect.arrayContaining(['sale:1', 'down:1']))
  })
})

