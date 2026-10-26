import { describe, expect, it } from 'vitest'
import { BRANDS, brandOf } from './brandIcons'

describe('the brand of a referring host', () => {
  it('knows the sites by their domains, subdomains and country forms', () => {
    expect(brandOf('l.facebook.com')?.name).toBe('Facebook')
    expect(brandOf('www.google.al')?.name).toBe('Google')
    expect(brandOf('google.co.uk')?.name).toBe('Google')
    expect(brandOf('news.ycombinator.com')?.name).toBe('Hacker News')
    expect(brandOf('t.co')?.name).toBe('X')
    expect(brandOf('https://www.reddit.com/r/x')?.name).toBe('Reddit')
  })
  it('has no mark for an unknown host, and never a near miss', () => {
    expect(brandOf('example.com')).toBeNull()
    expect(brandOf('notfacebook.com')).toBeNull()
    expect(brandOf(undefined)).toBeNull()
    expect(brandOf('')).toBeNull()
  })
  it('keeps a path for every mark', () => {
    for (const b of Object.values(BRANDS)) expect(b.d.length).toBeGreaterThan(20)
  })
})
