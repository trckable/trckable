import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberReturn, takeReturn } from './returnTo'

const at = (url: string) => {
  const u = new URL(url, 'http://x.test')
  vi.stubGlobal('location', { pathname: u.pathname, search: u.search, hash: u.hash })
}

describe('going back to where sign-in took the screen', () => {
  beforeEach(() => {
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
