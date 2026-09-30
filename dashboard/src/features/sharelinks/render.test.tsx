import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Share } from '../../lib/api'
import { LinkRow } from './LinkRow'
import { EMPTY } from './logic'
import { Preview } from './Preview'
import { numbersOf } from './numbers'
import type { Report } from '../../lib/api'

const noop = () => undefined
const share: Share = { id: 'shr_1', site_id: 's', name: 'Board', revenue: true, notes: false, has_password: true, created_at: 1, views: 42, viewed_at: 1_800_000_000, expires_at: null, embed_origins: ['https://a.com'] }
const row = (s: Partial<Share>, readOnly = false) => renderToStaticMarkup(<LinkRow site="s" share={{ ...share, ...s }} readOnly={readOnly} onChanged={noop} />)
const draw = (d: Partial<typeof EMPTY>, lockShown = false) => renderToStaticMarkup(<Preview draft={{ ...EMPTY, ...d }} numbers={null} domain="site.com" lockShown={lockShown} onLock={noop} />)

describe('a row', () => {
  it('has a revoke button, and a notes button that says which way it is', () => {
    const html = row({})
    expect(html).toContain('aria-label="Revoke Board"')
    expect(html).toContain('aria-pressed="false"')
    expect(row({ notes: true })).toContain('aria-pressed="true"')
  })
  it('tells apart a password link from a public one', () => {
    expect(row({})).toContain('Password link')
    expect(row({ has_password: false })).toContain('Public link')
  })
  it('names what it shows and what it is embedded on, and says it is fixed', () => {
    const html = row({})
    expect(html).toContain('Embeddable on https://a.com')
    expect(html).toContain('Fixed once the link is made')
    expect(row({ revenue: false, embed_origins: [] })).toContain('Revenue hidden')
  })
  it('gives its views and its last opening to a screen reader, and a dash to a link nobody opened', () => {
    expect(row({})).toContain('42 views. Last opened')
    expect(row({ views: 0, viewed_at: null })).toContain('Never opened')
  })
  it('shows an end date, or none', () => {
    expect(row({})).toContain('No end date')
    expect(row({ expires_at: 4_000_000_000 })).toContain('Ends ')
    expect(row({ expires_at: 1_000 })).toContain('Ended ')
  })
  it('has Copy and Open for a link with an address, and a quiet New address icon after them', () => {
    const html = row({ url: 'https://t.example/s/abc' })
    expect(html).toContain('aria-label="Copy link: Board"')
    expect(html).toContain('aria-label="Open link: Board"')
    expect(html).toContain('href="https://t.example/s/abc"')
    expect(html).toContain('aria-label="New address: Board"')
    expect(html).toContain('title="Make a new address"')
    expect(html).not.toContain('>New address<')
  })
  it('offers a new address, and no Copy or Open, for a link whose address cannot be shown', () => {
    const html = row({ url: undefined })
    expect(html).toContain('New address')
    expect(html).toContain("This address can&#x27;t be shown. Make a new one to copy.")
    expect(html).not.toContain('Copy link')
    expect(html).not.toContain('Open link')
    expect(html).toContain('aria-label="Revoke Board"')
  })
  it('keeps a password link as it was: its address is copyable, the lock stays', () => {
    const html = row({ has_password: true, url: 'https://t.example/s/abc' })
    expect(html).toContain('Password link')
    expect(html).toContain('Copy link: Board')
  })
  it('offers a viewer nothing to press', () => {
    const html = row({}, true)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('Revoke')
    expect(row({ url: 'https://t.example/s/abc' }, true)).not.toContain('Copy link')
  })
})

describe('the thumbnail', () => {
  it('leaves the revenue tile and the revenue bars out until revenue is on', () => {
    expect(draw({})).not.toContain('Revenue')
    const on = draw({ revenue: true })
    expect(on).toContain('Revenue by page')
    expect(on).toContain('sl-tiles four')
  })
  it('draws the note markers only when notes are on', () => {
    expect(draw({})).not.toContain('sl-note')
    expect(draw({ notes: true })).toContain('sl-note')
  })
  it('shows the end date', () => {
    expect(draw({})).not.toContain('sl-ends')
    expect(draw({ expiry: '7' })).toContain('sl-ends')
  })
  it('offers the lock only for a password link, and then shows its screen', () => {
    expect(draw({})).not.toContain('sl-lock')
    expect(draw({ access: 'password' })).toContain('Show the password screen')
    const locked = draw({ access: 'password' }, true)
    expect(locked).toContain('sl-locked')
    expect(locked).not.toContain('sl-tiles')
  })
})

describe('the numbers behind it', () => {
  it('come from the report and stay in a drawable size', () => {
    const report = {
      current: {
        kpis: { visitors: 12400, pageviews: 38100, bounce_rate: 0.41 },
        series: Array.from({ length: 30 }, (_, i) => ({ t: '', visitors: i, pageviews: i, revenue: 100 })),
        dims: { channel: [{ value: 'a', visitors: 10 }, { value: 'b', visitors: 5 }] },
        money: { currency: 'USD', exponent: 2, revenue: 824000 },
        revenue_dims: { page: [{ value: '/', visitors: 1, revenue: 50 }] },
      },
    } as unknown as Report
    const n = numbersOf(report)
    expect(n.visitors).toBe('12.4K')
    expect(n.bounce).toBe('41%')
    expect(n.revenue).toBe('$8,240')
    expect(n.bars).toHaveLength(7)
    expect(n.sources).toEqual([1, 0.5])
    expect(n.pages).toEqual([1])
  })
})
