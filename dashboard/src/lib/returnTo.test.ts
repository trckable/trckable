import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberReturn, sameOrigin, takeReturn } from './returnTo'

const at = (url: string) => {
  const u = new URL(url, 'http://x.test')
  vi.stubGlobal('location', { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash })
}

describe('going back to where sign-in took the screen', () => {
  beforeEach(() => {
    at('/')
    const kept = new Map<string, string>()
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) })
  })
  it('returns the address that was open, once', () => {
    at('/my.shop.co?period=7d&f=source%3Agoogle.com#x')
    rememberReturn(1000)
    expect(takeReturn(2000)).toBe('/my.shop.co?period=7d&f=source%3Agoogle.com#x')
    expect(takeReturn(2000)).toBeNull()
  })
  it('forgets the sign-in pages, and an address that is old', () => {
    at('/login')
    rememberReturn(1000)
    expect(takeReturn(1001)).toBeNull()
    at('/my.shop.co')
    rememberReturn(1000)
    expect(takeReturn(1000 + 31 * 60_000)).toBeNull()
  })
  it('never leaves the app', () => {
    sessionStorage.setItem('trckable:return', JSON.stringify({ to: '//evil.example/x', at: 1000 }))
    expect(takeReturn(1001)).toBeNull()
    sessionStorage.setItem('trckable:return', JSON.stringify({ to: 'https://evil.example', at: 1000 }))
    expect(takeReturn(1001)).toBeNull()
  })
})

describe('which addresses sign-in may return to', () => {
  beforeEach(() => at('/'))
  it('takes a path of this app, with its query and hash', () => {
    expect(sameOrigin('/example.com')).toBe('/example.com')
    expect(sameOrigin('/example.com?period=7d&f=a%3Ab#top')).toBe('/example.com?period=7d&f=a%3Ab#top')
  })
  it.each([
    '//evil.example/x',
    '///evil.example',
    '/\\evil.example',
    '/\\/evil.example',
    '/x\\y',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '\\\\evil.example',
    'https://evil.example',
    'http://x.test/ok',
    'javascript:alert(1)',
    'data:text/html,x',
    'evil.example/x',
    '',
    '/login',
    '/login?x=1',
    '/setup',
  ])('refuses %j', (to) => {
    expect(sameOrigin(to)).toBeNull()
  })
})
