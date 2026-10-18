import { describe, expect, it } from 'vitest'
import { arrange, badge, fromAnswers, othersOf, OTHERS, rowsOf, settle, unreadCount, withFeed, type Notice } from './notices'

const n = (id: string, at: number, kind: Notice['kind'] = 'down'): Notice => ({ id, kind, site: 'a.com', title: id, sub: '', at })

describe('the bell list', () => {
  it('puts the newest first, drops a week-old one and repeats', () => {
    const now = 10_000_000
    const out = arrange([n('a', now - 100), n('b', now - 10), n('a', now - 100), n('old', now - 8 * 86400)], now)
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

describe('the account’s other sites', () => {
  const site = (id: string, last?: number) => ({ id, domain: id + '.com', last_event_at: last }) as never
  it('are read when they have had a visit, a few of them, never the one in view', () => {
    const all = [site('a', 1), site('b'), ...Array.from({ length: 9 }, (_, i) => site(`s${i}`, 1))]
    const out = othersOf(all, all[0])
    expect(out.map((s) => s.id)).not.toContain('a')
    expect(out.map((s) => s.id)).not.toContain('b')
    expect(out).toHaveLength(OTHERS)
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

describe('the bell and Answers', () => {
  const rep = {
    changes: [
      { at: 5000, engine: 'openai' as const, question_id: 4, question: 'best analytics', kind: 'dropped' as const },
      { at: 4000, engine: 'anthropic' as const, question_id: 4, question: 'best analytics', kind: 'seen' as const, first_ever: true },
    ],
    paused: true,
  }

  it('shows a change as a row that opens Answers, the first time with its own words, and a budget that ran out', () => {
    let opened = 0
    const rows = fromAnswers(rep, 'a.com', 9000, () => opened++)
    expect(rows.map((r) => r.title)).toEqual(['ChatGPT stopped naming you for “best analytics”', 'Peekaboo. Claude just named you.', 'Paused until the 1st: this month’s budget is used.'])
    expect(new Set(rows.map((r) => r.id)).size).toBe(3)
    rows[0].open?.()
    expect(opened).toBe(1)
    expect(rows.every((r) => r.kind === 'answer' && r.site === 'a.com')).toBe(true)
  })

  it('is nothing when nothing changed', () => {
    expect(fromAnswers({}, 'a.com', 9000, () => undefined)).toEqual([])
  })
})
