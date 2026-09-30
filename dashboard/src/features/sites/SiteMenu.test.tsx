import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { AllStrip } from './AllStrip'
import { SiteItem } from './SiteItem'

const NOW = Math.floor(Date.now() / 1000)
const site = (i: number, o: Partial<Site> = {}): Site => ({ id: 's' + String(i), domain: `site${i}.example`, name: `Site ${i}`, timezone: 'UTC', currency: 'USD', proxy_key: '', last_event_at: NOW - 3600, ...o })
const noop = () => {}

// SiteMenu reads who is signed in from module state: each test starts afresh.
async function menu(n: number, role: 'owner' | 'viewer' = 'owner') {
  vi.resetModules()
  const me = await import('../../lib/me')
  me.setRole(role)
  const { SiteMenu } = await import('./SiteMenu')
  const sites = Array.from({ length: n }, (_, i) => site(i + 1))
  return renderToStaticMarkup(<SiteMenu sites={sites} current={sites[0]} all={false} onClose={noop} />)
}

describe('the switcher list', () => {
  // The page's address is read when the menu's modules load.
  beforeEach(() => {
    vi.stubGlobal('location', { search: '', pathname: '/', hash: '' })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('has no search up to six sites, and one from the seventh', async () => {
    expect(await menu(4)).not.toContain('type="search"')
    expect(await menu(6)).not.toContain('type="search"')
    expect(await menu(7)).toContain('type="search"')
  })

  it('sets its density by the count: roomy to three sites, middle to six, compact beyond', async () => {
    expect(await menu(1)).toContain('class="pop sites roomy"')
    expect(await menu(3)).toContain('class="pop sites roomy"')
    expect(await menu(4)).toContain('class="pop sites mid"')
    expect(await menu(6)).toContain('class="pop sites mid"')
    expect(await menu(7)).toContain('class="pop sites compact"')
    expect(await menu(3)).toContain('width:calc(22px * var(--ph-mark, 1))')
    expect(await menu(5)).toContain('width:calc(20px * var(--ph-mark, 1))')
    expect(await menu(9)).toContain('width:calc(18px * var(--ph-mark, 1))')
  })

  it('numbers the first nine sites for the 1–9 keys and marks the one you are on', async () => {
    const html = await menu(10)
    expect(html.match(/class="site-key"/g)).toHaveLength(9)
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toContain('class="site on"')
  })

  it('puts All sites first as a chip, only when there is more than one site', async () => {
    expect(await menu(3)).toContain('all-chip')
    expect(await menu(1)).not.toContain('all-chip')
  })

  it('ends with Add a site as a quiet row for an owner, and hides it from a viewer', async () => {
    const owner = await menu(3)
    expect(owner).toContain('foot-add')
    expect(owner).toContain('Add a site')
    expect(owner).toContain('foot-keys')
    expect(await menu(3, 'viewer')).not.toContain('foot-add')
  })

  it('shows no numbers until they are loaded', async () => {
    expect(await menu(3)).not.toContain('class="tail')
    expect(await menu(3)).not.toContain('strip-sum')
  })
})

describe('a site row', () => {
  const row = (s: Site, today?: number) => renderToStaticMarkup(<SiteItem site={s} place={{ kind: 'rest' }} on={false} arrange={null} today={today} onPick={noop} />)

  it("shows today's visitors as a small number", () => {
    const html = row(site(1), 1284)
    expect(html).toContain('class="tail"')
    expect(html).toContain('1,284')
  })

  it('shows a quiet zero, and nothing before the numbers are here', () => {
    expect(row(site(1), 0)).toContain('class="tail faint"')
    expect(row(site(1))).not.toContain('tail')
  })

  it('says setup or stopped in the number’s place', () => {
    const fresh = row(site(1, { last_event_at: undefined }), 0)
    expect(fresh).toContain('setup')
    expect(fresh).not.toContain('>0<')
    const stopped = row(site(2, { last_event_at: NOW - 3 * 86400, check: { at: NOW - 3600, found: 'none' } }), 5)
    expect(stopped).toContain('stopped')
    expect(stopped).not.toContain('>5<')
  })

  it('has the check on the site you are on', () => {
    const html = renderToStaticMarkup(<SiteItem site={site(1)} place={{ kind: 'rest' }} on={true} arrange={null} onPick={noop} />)
    expect(html).toContain('class="tick"')
    expect(html).toContain('<svg')
  })
})

describe('the All sites chip', () => {
  it('is only the chip until the numbers are here, then adds online now and today', () => {
    const bare = renderToStaticMarkup(<AllStrip on={false} numbers={null} onPick={noop} />)
    expect(bare).toContain('All sites')
    expect(bare).not.toContain('strip-sum')
    const by = new Map([['a', { visitors: 12, online: 2 }], ['b', { visitors: 30, online: 1 }]])
    const full = renderToStaticMarkup(<AllStrip on={false} numbers={by} onPick={noop} />)
    expect(full).toContain('strip-sum')
    expect(full).toContain('>3<')
    expect(full).toContain('42')
  })
})
