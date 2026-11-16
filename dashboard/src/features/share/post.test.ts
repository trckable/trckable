import { describe, expect, it } from 'vitest'
import type { Share } from '../../lib/api'
import { linkedInAddress, postLink, slackText, withLink, xAddress } from './post'

const post = 'We passed 10,000 visitors & counting\nThanks to everyone who read it'
const url = 'https://reports.acme.com/s/abc123'

describe('a post and its link', () => {
  it('puts the link on a line of its own, and nothing when there is none', () => {
    expect(withLink('Hello', url)).toBe(`Hello\n${url}`)
    expect(withLink('Hello')).toBe('Hello')
  })
})

describe('X', () => {
  it("opens the composer with the post as text and the link as its own field", () => {
    const u = new URL(xAddress(post, url))
    expect(u.origin + u.pathname).toBe('https://x.com/intent/post')
    expect(u.searchParams.get('text')).toBe(post)
    expect(u.searchParams.get('url')).toBe(url)
  })
  it('leaves the link out when there is none', () => {
    expect(new URL(xAddress(post)).searchParams.has('url')).toBe(false)
  })
})

describe('LinkedIn', () => {
  it('opens the composer with the post and the link as its text', () => {
    const u = new URL(linkedInAddress(post, url))
    expect(u.origin + u.pathname).toBe('https://www.linkedin.com/feed/')
    expect(u.searchParams.get('shareActive')).toBe('true')
    expect(u.searchParams.get('text')).toBe(`${post}\n${url}`)
  })
})

describe('Slack', () => {
  it('is the plain text, and HTML that turns the link into a link and keeps the words safe', () => {
    const { text, html } = slackText('<b>Big</b> news\nSecond line', url)
    expect(text).toBe(`<b>Big</b> news\nSecond line\n${url}`)
    expect(html).toBe(`<p>&lt;b&gt;Big&lt;/b&gt; news<br>Second line<br><a href="${url}">${url}</a></p>`)
  })
  it('has no link line without a link', () => {
    expect(slackText('Hello').html).toBe('<p>Hello</p>')
  })
})

describe('the link a post carries', () => {
  const link = (s: Partial<Share>): Share => ({ id: 'a', site_id: 's', name: 'x', revenue: false, has_password: false, created_at: 1, views: 0, url: 'https://t.example/s/a', ...s })
  const now = 1_800_000_000_000
  it('is the first one anybody can open that shows no revenue and has not ended', () => {
    expect(postLink([link({ has_password: true, url: 'https://t.example/s/pw' }), link({ revenue: true, url: 'https://t.example/s/rev' }), link({ expires_at: 1_700_000_000, url: 'https://t.example/s/old' }), link({ url: 'https://t.example/s/ok' })], now)).toBe('https://t.example/s/ok')
    expect(postLink([link({ expires_at: 1_900_000_000 })], now)).toBe('https://t.example/s/a')
  })
  it('is none when no link is fit to be in a post, and a link with no address is never one', () => {
    expect(postLink([link({ has_password: true })], now)).toBeUndefined()
    expect(postLink([link({ url: undefined })], now)).toBeUndefined()
    expect(postLink([], now)).toBeUndefined()
  })
})
