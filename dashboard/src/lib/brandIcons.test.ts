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
  it('picks the most specific host, and knows a source named without a domain', () => {
    expect(brandOf('news.google.com')?.name).toBe('Google News')
    expect(brandOf('gemini.google.com')?.name).toBe('Gemini')
    expect(brandOf('google.com')?.name).toBe('Google')
    expect(brandOf('google')?.name).toBe('Google')
    expect(brandOf('Google Ads')?.name).toBe('Google')
    expect(brandOf('claude.ai')?.name).toBe('Claude')
  })
  it('lists every host once', () => {
    const hosts = Object.values(BRANDS).flatMap((b) => b.hosts)
    expect(new Set(hosts).size).toBe(hosts.length)
  })
  it('keeps a path for every mark', () => {
    for (const b of Object.values(BRANDS)) expect(b.d.length).toBeGreaterThan(20)
  })
})
