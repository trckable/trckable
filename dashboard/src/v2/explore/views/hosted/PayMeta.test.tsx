import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../ui/Flag', () => ({ Flag: ({ code }: { code: string }) => <i data-flag={code} /> }))

const { CountryMark, MethodMark, ProviderTag, SourceTag, UnlinkedMark } = await import('./PayMeta')

describe('the marks of a payment line', () => {
  it('a country is its flag, with its name as title and label', () => {
    const html = renderToStaticMarkup(<CountryMark code="DE" />)
    expect(html).toContain('data-flag="DE"')
    expect(html).toMatch(/title="Germany"[^>]*aria-label="Germany"/)
  })
  it('a provider is its mark, named', () => {
    expect(renderToStaticMarkup(<ProviderTag id="stripe" />)).toContain('title="Stripe"')
    expect(renderToStaticMarkup(<ProviderTag id="dodo" />)).toContain('title="Dodo Payments"')
  })
  it('a source is its mark with the channel and the site in words', () => {
    expect(renderToStaticMarkup(<SourceTag channel="Search" referrer="google.com" />)).toMatch(/title="Search · google.com"/)
  })
  it('how it was paid is a glyph, and nothing for other or unknown', () => {
    expect(renderToStaticMarkup(<MethodMark method="card" />)).toContain('title="Card"')
    expect(renderToStaticMarkup(<MethodMark method="other" />)).toBe('')
    expect(renderToStaticMarkup(<MethodMark />)).toBe('')
  })
  it('says nothing for a payment without the fact, and keeps the words for the unlinked mark', () => {
    expect(renderToStaticMarkup(<CountryMark />)).toBe('')
    expect(renderToStaticMarkup(<ProviderTag />)).toBe('')
    expect(renderToStaticMarkup(<SourceTag />)).toBe('')
    expect(renderToStaticMarkup(<UnlinkedMark />)).toContain('aria-label="Not linked to a visit"')
  })
})
