import { describe, expect, it } from 'vitest'
import { OPENERS, X_LINK, X_MAX, postText, takesText, withLink, xLength } from './post'

const opener = (place: string) => OPENERS[place] ?? (() => '')
const link = 'https://example.com/s/abc?t=toppage&period=30d&shape=post'
const text = '10,685 people on example.com (last 30 days). Counted with trckable, no cookies.'

describe('the post text', () => {
  it('is the card\'s own words until a person writes their own, which stay', () => {
    expect(postText('from the card', null)).toBe('from the card')
    expect(postText('from the card', 'mine')).toBe('mine')
    expect(postText('from the card', '')).toBe('')
  })
  it('puts the link on a line of its own', () => expect(withLink('a', 'https://x.y/z')).toBe('a\nhttps://x.y/z'))
})

describe('the count on X', () => {
  it('counts the link as 24 characters whatever its length', () => {
    expect(xLength('')).toBe(X_LINK)
    expect(xLength(text)).toBe(text.length + 24)
  })
  it('counts a character, not a code unit', () => expect(xLength('😀😀')).toBe(2 + X_LINK))
  it('stops at 280', () => expect(xLength('a'.repeat(X_MAX - X_LINK))).toBe(X_MAX))
})

describe('the address each place opens', () => {
  const at = (place: string) => new URL(opener(place)(text, link))
  it('opens the network\'s own composer, the text and the link encoded', () => {
    const x = at('x')
    expect(`${x.origin}${x.pathname}`).toBe('https://x.com/intent/post')
    expect(x.searchParams.get('text')).toBe(text)
    expect(x.searchParams.get('url')).toBe(link)
    for (const place of ['threads', 'bluesky']) expect(at(place).searchParams.get('text')).toBe(`${text}\n${link}`)
    expect(`${at('threads').origin}${at('threads').pathname}`).toBe('https://www.threads.net/intent/post')
    expect(`${at('bluesky').origin}${at('bluesky').pathname}`).toBe('https://bsky.app/intent/compose')
  })
  it('opens LinkedIn and Facebook with the link, from which they read the card', () => {
    const li = at('linkedin')
    expect(li.href.startsWith('https://www.linkedin.com/sharing/share-offsite/?')).toBe(true)
    expect(li.searchParams.get('url')).toBe(link)
    const fb = at('facebook')
    expect(`${fb.origin}${fb.pathname}`).toBe('https://www.facebook.com/sharer/sharer.php')
    expect(fb.searchParams.get('u')).toBe(link)
  })
  it('keeps what is written out of the address\'s own structure', () => {
    const tricky = 'a&b=c#d é'
    expect(new URL(opener('x')(tricky, link)).searchParams.get('text')).toBe(tricky)
  })
  it('has no composer for Instagram, the file or the link', () => {
    for (const p of ['instagram', 'download', 'email']) expect(OPENERS[p]).toBeUndefined()
  })
  it('copies the text for the networks that take only a link', () => {
    expect(['x', 'threads', 'bluesky'].every(takesText)).toBe(true)
    expect(['linkedin', 'facebook'].some(takesText)).toBe(false)
  })
})
