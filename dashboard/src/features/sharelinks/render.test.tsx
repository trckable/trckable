import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Share, Site } from '../../lib/api'
import { LinkRow } from './LinkRow'
import { LivePreview } from './LivePreview'
import { NewLink } from './NewLink'

const noop = () => undefined
const share: Share = { id: 'shr_1', site_id: 's', name: 'Board', revenue: true, notes: false, has_password: true, created_at: 1, views: 42, viewed_at: 1_800_000_000, expires_at: null, embed_origins: ['https://a.com'] }
const row = (s: Partial<Share>, readOnly = false) => renderToStaticMarkup(<LinkRow site="s" share={{ ...share, ...s }} readOnly={readOnly} onChanged={noop} />)

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
  it('has an Edit button that opens the fields of the link, none for a viewer', () => {
    expect(row({})).toContain('aria-label="Edit link: Board"')
    expect(row({})).toContain('aria-expanded="false"')
    expect(row({}, true)).not.toContain('Edit link')
  })
  it('offers a viewer nothing to press', () => {
    const html = row({}, true)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('Revoke')
    expect(row({ url: 'https://t.example/s/abc' }, true)).not.toContain('Copy link')
  })
})

describe('the new-link form', () => {
  const site = { id: 's', domain: 'acme.com', name: 'Acme', timezone: 'UTC', currency: 'USD', proxy_key: '' } as Site
  const form = (bare = false) => renderToStaticMarkup(<NewLink site={site} bare={bare} onClose={noop} onMade={noop} />)
  it('is named after the domain and keeps the password, end date and embedding under More', () => {
    const html = form()
    expect(html).toContain('placeholder="acme.com"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Who can open it')
    expect(html).not.toContain('Embed on sites')
  })
  it('draws the picture of the result unless the host has its own', () => {
    expect(form()).toContain('sl-preview')
    expect(form(true)).not.toContain('sl-preview')
    expect(form(true)).toContain('sl-new bare')
  })
})

describe('the preview of the page', () => {
  const options = { name: 'Board', revenue: false, notes: false, sections: ['pages'], period: '7d' }
  const draw = (p: Partial<Parameters<typeof LivePreview>[0]> = {}) => renderToStaticMarkup(<LivePreview site="s" host="reports.acme.com" options={options} {...p} />)
  it('says where the page would be and waits for it', () => {
    const html = draw()
    expect(html).toContain('reports.acme.com/s/······')
    expect(html).toContain('sl-live-wait')
    expect(html).not.toContain('<iframe')
  })
  it('offers the password page only when the link has a password', () => {
    expect(draw()).not.toContain('sl-lock')
    expect(draw({ lock: false, onLock: noop })).toContain('Show the password screen')
    expect(draw({ lock: true, onLock: noop })).toContain('Show the page')
  })
})
