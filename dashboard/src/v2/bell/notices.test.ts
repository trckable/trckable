import { describe, expect, it } from 'vitest'
import { arrange, badge, othersOf, OTHERS, unreadCount, withFeed, type Notice } from './notices'

const n = (id: string, at: number, kind: Notice['kind'] = 'down'): Notice => ({ id, kind, site: 'a.com', title: id, sub: '', at })

describe('the bell list', () => {
  it('puts the newest first, drops a week-old one and repeats', () => {
    const now = 10_000_000
    const out = arrange([n('a', now - 100), n('b', now - 10), n('a', now - 100), n('old', now - 8 * 86400)], now)
    expect(out.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('counts what is unread and caps the badge', () => {
    expect(unreadCount([n('a', 1), n('b', 2)], new Set(['a']))).toBe(1)
    expect(badge(12)).toBe('9+')
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
