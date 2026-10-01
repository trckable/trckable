import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import type { AccountCard } from '../../lib/accountView'

const card = (id: string, name: string, role: string, n: number, total = n): AccountCard => ({
  id,
  name,
  role,
  holder: false,
  total,
  sites: Array.from({ length: n }, (_, i) => ({ id: `${id}-s${i}`, domain: `${id}${i}.example`, name: `${name} site ${i}` })),
})
const noop = () => {}
const site = (i: number): Site => ({ id: `s${i}`, domain: `site${i}.example`, name: `Site ${i}`, timezone: 'UTC', currency: 'USD', proxy_key: '' })

// Module state (who is signed in, which accounts): each test starts afresh.
async function sections(list: AccountCard[], here: string) {
  vi.resetModules()
  const { view } = await import('../../lib/accountView')
  view.list = list
  view.account = here
  const { AccountSections } = await import('./AccountSections')
  return renderToStaticMarkup(<AccountSections onClose={noop} />)
}

describe('the other accounts in the switcher', () => {
  beforeEach(() => vi.stubGlobal('location', { search: '', pathname: '/', hash: '' }))
  afterEach(() => vi.unstubAllGlobals())

  it('shows nothing for a person in one account', async () => {
    expect(await sections([card('a', 'Ann', 'owner', 2)], 'a')).toBe('')
  })

  it('lists each other account folded: name, role and how many sites', async () => {
    const html = await sections([card('a', 'Ann', 'owner', 2), card('b', 'Bo’s team', 'viewer', 3), card('c', 'Cy', 'owner', 1)], 'a')
    expect(html).toContain('>Bo’s team</span><span class="acct-meta"> · Viewer · 3 sites<')
    expect(html).toContain('>Cy</span><span class="acct-meta"> · Owner · 1 site<')
    expect(html).not.toContain('>Ann<')
    expect(html).toContain('aria-expanded="false"')
    // Folded: no site of theirs is on the list yet.
    expect(html).not.toContain('b0.example')
  })

  it('opens to the first sites and "N more"', async () => {
    const { Section } = await import('./AccountSections')
    const html = renderToStaticMarkup(<Section a={card('b', 'Bo', 'viewer', 2, 9)} shut={false} onFold={noop} onClose={noop} />)
    expect(html).toContain('Bo site 0')
    expect(html).toContain('Bo site 1')
    expect(html).toContain('7 more')
    expect(html).toContain('aria-expanded="true"')
  })

  it('is part of the site menu for two accounts, and absent for one', async () => {
    const menu = async (list: AccountCard[]) => {
      vi.resetModules()
      const me = await import('../../lib/me')
      me.setRole('viewer')
      const { view } = await import('../../lib/accountView')
      view.list = list
      view.account = 'a'
      const { SiteMenu } = await import('./SiteMenu')
      const sites = [site(1), site(2)]
      return renderToStaticMarkup(<SiteMenu sites={sites} current={sites[0]} all={false} onClose={noop} />)
    }
    expect(await menu([card('a', 'Ann', 'owner', 2), card('b', 'Bo', 'viewer', 3)])).toContain(' · Viewer · 3 sites')
    expect(await menu([card('a', 'Ann', 'owner', 2)])).not.toContain('Viewer · ')
  })
})
