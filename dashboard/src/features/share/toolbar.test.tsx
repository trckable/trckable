import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ShareLook, Site } from '../../lib/api'
import { Toolbar } from './Toolbar'
import type { Look as Card } from './card'
import type { Look } from './useLook'

const site = { id: 's1', domain: 'example.com' } as Site
const card: Card = { template: 'overview', period: '7d', metric: 'visitors', stats: ['engaged'], theme: 'dark', accent: '#b8ff3c' }
const lookOf = (l: Partial<ShareLook> | null) => ({ look: l && { color: '', hide_brand: false, domain: '', domain_ok: false, logo_url: '', target: '', ...l }, edit: {} }) as unknown as Look
const draw = (brand: Look, template: Card['template'] = 'overview') =>
  renderToStaticMarkup(<Toolbar site={site} sites={[site]} onSite={() => undefined} look={{ ...card, template }} set={() => undefined} metrics={['visitors']} revenue={false} brand={brand} />)
const BUTTON = 'aria-label="Hide trckable branding"'

describe('hide branding button', () => {
  it('is there when the plan allows it, pressed when hidden', () => {
    expect(draw(lookOf({}))).toContain(BUTTON)
    expect(draw(lookOf({ hide_brand: true }))).toMatch(/aria-pressed="true"[^>]*Hide trckable branding|Hide trckable branding[^>]*aria-pressed="true"/)
  })
  it('is not offered when the plan locks it', () => expect(draw(lookOf({ brand_locked: true }))).not.toContain(BUTTON))
  it('is not there on a post, or before the look is loaded', () => {
    expect(draw(lookOf({}), 'post')).not.toContain(BUTTON)
    expect(draw(lookOf(null))).not.toContain(BUTTON)
  })
})
