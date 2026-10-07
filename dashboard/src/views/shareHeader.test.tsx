import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ShareInfo } from '../lib/api'
import { EmbedHeader, ShareHeader } from './Share'
import { accentVars } from './shareAccent'

const info: ShareInfo = { name: 'Test', revenue: false, domain: 'example.org', site: 'example', timezone: 'UTC', currency: 'USD', modules: {} }
const header = (p: Partial<ShareInfo>) => renderToStaticMarkup(<ShareHeader info={{ ...info, ...p }} />)

describe('the shared page header', () => {
  it('puts the site mark before the site name and the link name', () => {
    const html = header({})
    expect(html.indexOf('site-mark')).toBeGreaterThan(-1)
    expect(html.indexOf('site-mark')).toBeLessThan(html.indexOf('example</b>'))
    expect(html).toContain('Test')
  })
  it('draws the site\'s initial on its colour when it has no icon', () => {
    const html = header({ color: '#3366ff' })
    expect(html).toContain('site-mark letter')
    expect(html).toContain('>E<')
    expect(html).not.toContain('<img')
  })
  it('draws the icon from this server when it has one', () => {
    const html = header({ icon_url: '/api/v1/share/icon?v=7' })
    expect(html).toContain('src="/api/v1/share/icon?v=7"')
    expect(html).toContain('width="20"')
  })
})

describe('a link with its owner\'s own look', () => {
  it('shows trckable\'s wordmark by default and the owner\'s logo in its place', () => {
    expect(header({})).toContain('class="tkb-logo')
    const html = header({ logo_url: '/api/v1/share/logo?v=3' })
    expect(html).toContain('class="share-logo"')
    expect(html).toContain('src="/api/v1/share/logo?v=3"')
    expect(html).not.toContain('class="tkb-logo')
    expect(html).toContain('share-credit')
  })
  it('hides trckable\'s name when asked, with or without a logo', () => {
    expect(header({ hide_brand: true })).not.toContain('class="tkb-logo')
    const html = header({ hide_brand: true, logo_url: '/api/v1/share/logo?v=3' })
    expect(html).not.toContain('share-credit')
    expect(renderToStaticMarkup(<EmbedHeader info={{ ...info, hide_brand: true }} />)).not.toContain('analytics by')
    expect(renderToStaticMarkup(<EmbedHeader info={info} />)).toContain('analytics by')
  })
})

describe('the owner\'s colour as the page\'s accent', () => {
  it('sets the accent and picks readable text on it', () => {
    expect(accentVars('#ffee00')).toMatchObject({ '--accent': '#ffee00', '--accent-ink': '#0b0d10' })
    expect(accentVars('#112233')).toMatchObject({ '--accent': '#112233', '--accent-ink': '#ffffff' })
  })
  it('ignores anything that is not #rrggbb', () => {
    for (const bad of [undefined, '', 'red', '#fff', 'url(x)', '#12345g']) expect(accentVars(bad)).toBeUndefined()
  })
})
