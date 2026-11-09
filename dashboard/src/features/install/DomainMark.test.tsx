import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DomainMark, faviconSrc, tileState } from './DomainMark'

describe('the domain field’s mark', () => {
  it('is the letter with no favicon asked for yet', () => {
    expect(tileState('', false, false)).toBe('letter')
  })
  it('keeps the letter while the favicon loads, then shows the favicon', () => {
    const src = faviconSrc('example.com')
    expect(tileState(src, false, false)).toBe('loading')
    expect(tileState(src, true, false)).toBe('icon')
  })
  it('stays the letter when there is no favicon', () => {
    expect(tileState(faviconSrc('example.com'), false, true)).toBe('letter')
  })
  it('asks for nothing before typing has paused', () => {
    const html = renderToStaticMarkup(<DomainMark domain="example.com" valid />)
    expect(html).toContain('data-state="letter"')
    expect(html).toContain('data-letter="E"')
    expect(html).not.toContain('<img')
  })
  it('encodes the domain in the request', () => {
    expect(faviconSrc('a b.com')).toContain('domain=a%20b.com')
  })
})
