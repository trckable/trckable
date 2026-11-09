import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ShareLook, Site } from '../../lib/api'
import { LookSection } from './LookSection'
import type { Look as Card } from './card'
import type { Look } from './useLook'

const site = { id: 's1', domain: 'example.com' } as Site
const card: Card = { template: 'overview', shape: 'link', period: '7d', compare: false, metric: 'visitors', stats: ['engaged'], theme: 'dark', accent: '#b8ff3c' }
const lookOf = (l: Partial<ShareLook> | null) => ({ look: l && { color: '', hide_brand: false, domain: '', domain_ok: false, logo_url: '', target: '', ...l }, edit: {} }) as unknown as Look
const draw = (brand: Look, template: Card['template'] = 'overview') =>
  renderToStaticMarkup(<LookSection site={site} sites={[site]} onSite={() => undefined} look={{ ...card, template }} set={() => undefined} brand={brand} />)
const BRAND = 'aria-label="Hide trckable branding"'

describe('hide branding switch', () => {
  it('is there when the plan allows it, on when hidden', () => {
    expect(draw(lookOf({}))).toContain(BRAND)
    expect(draw(lookOf({ hide_brand: true }))).toMatch(/aria-checked="true"/)
  })
  it('is not offered when the plan locks it', () => expect(draw(lookOf({ brand_locked: true }))).not.toContain(BRAND))
  it('is not there on a post, or before the look is loaded', () => {
    expect(draw(lookOf({}), 'post')).not.toContain(BRAND)
    expect(draw(lookOf(null))).not.toContain(BRAND)
  })
})

describe('size', () => {
  it('offers the four sizes, the picked one checked, but not on a post', () => {
    const html = draw(lookOf({}))
    expect(html.match(/aria-label="Size"/g)).toHaveLength(1)
    expect(html).toContain('Square')
    expect(html).toContain('Story')
    expect(draw(lookOf({}), 'post')).not.toContain('Square')
  })
})
