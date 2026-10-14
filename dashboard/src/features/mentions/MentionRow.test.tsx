import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Mention } from './api'
import { MentionRow } from './MentionRow'

const base: Mention = { id: 1, source: 'hn', url: 'https://news.ycombinator.com/item?id=1', title: 'Show HN: Acme', author: 'maker1', host: 'news.ycombinator.com', posted_at: 1_700_000_000, found_at: 1_700_000_100, visitors: 1212, front: true }

describe('one mention on the card', () => {
  it('links out safely and shows what it brought', () => {
    const html = renderToStaticMarkup(<MentionRow m={base} />)
    expect(html).toContain('href="https://news.ycombinator.com/item?id=1"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('Show HN: Acme')
    expect(html).toContain('1,212')
    expect(html).toContain('visitors')
    expect(html).toContain('Front page')
    expect(html).toContain('by maker1')
  })

  it('shows a dash, not a zero, while nobody has been counted', () => {
    const html = renderToStaticMarkup(<MentionRow m={{ ...base, visitors: 0 }} />)
    expect(html).toContain('<strong>–</strong>')
    expect(html).toContain('No visitors counted yet')
  })

  it('never makes a link of an address that is not a web page', () => {
    const html = renderToStaticMarkup(<MentionRow m={{ ...base, url: 'javascript:alert(1)' }} />)
    expect(html).not.toContain('href=')
    expect(html).toContain('Show HN: Acme')
  })

  it('escapes whatever the title carries', () => {
    const html = renderToStaticMarkup(<MentionRow m={{ ...base, title: '<img src=x onerror=alert(1)>' }} />)
    expect(html).not.toContain('<img')
  })
})
