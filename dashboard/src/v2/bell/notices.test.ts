import { describe, expect, it } from 'vitest'
import { arrange, badge, unreadCount, type Notice } from './notices'

const n = (id: string, at: number): Notice => ({ id, kind: 'down', site: 'a.com', title: id, sub: '', at })

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
