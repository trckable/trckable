import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ShareLook, Site } from '../../lib/api'
import { LinkPreview } from './LinkPreview'
import type { Look } from './useLook'

const site: Site = { id: 's', domain: 'acme.com', name: 'Acme', timezone: 'UTC', currency: 'USD', proxy_key: '' }
const base: ShareLook = { color: '', hide_brand: false, domain: '', domain_ok: false, logo_url: '', target: 'dash.example.com' }
const draw = (look: Partial<ShareLook> | null, domain = '') =>
  renderToStaticMarkup(<LinkPreview site={site} state={{ look: look && { ...base, ...look }, domain, setDomain: () => undefined, edit: {} as Look['edit'] }} />)

describe('the preview of the shared page', () => {
  it('is trckable\'s own look when nothing is set, and before the look has loaded', () => {
    for (const html of [draw({}), draw(null)]) {
      expect(html).toContain('tkb-logo')
      expect(html).not.toContain('sd-pv-logo')
      expect(html).not.toContain('--accent')
    }
  })
  it('shows the logo in place of the wordmark, with the credit unless hidden', () => {
    const html = draw({ logo_url: '/api/v1/sites/s/share-logo?v=1' })
    expect(html).toContain('class="sd-pv-logo"')
    expect(html).toContain('sd-pv-credit')
    expect(html.match(/tkb-logo/g)?.length ?? 0).toBe(0)
    expect(draw({ logo_url: '/x', hide_brand: true })).not.toContain('sd-pv-credit')
  })
  it('hides the name when asked', () => {
    expect(draw({ hide_brand: true })).not.toContain('tkb-logo')
  })
  it('puts the chosen colour on the page and the typed domain in the address bar', () => {
    const html = draw({ color: '#336699' }, 'reports.acme.com')
    expect(html).toContain('--accent:#336699')
    expect(html).toContain('reports.acme.com')
  })
})
