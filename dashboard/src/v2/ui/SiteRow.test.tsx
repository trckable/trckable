import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { OpenSite } from '../../features/sites/OpenSite'
import { RowMenu, SiteRow } from './SiteRow'

const NOW = Math.floor(Date.now() / 1000)
const site = (o: Partial<Site> = {}): Site => ({ id: 's1', domain: 'example.com', name: 'Example', timezone: 'UTC', currency: 'USD', proxy_key: '', last_event_at: NOW - 60, ...o })
const noop = () => {}
const row = (s: Site, today?: number) => renderToStaticMarkup(<SiteRow site={s} place={{ kind: 'rest' }} on={false} arrange={null} today={today} onPick={noop} />)

// A row holds no state, so it can be called as a plain function and its element tree walked for handlers.
function find(node: ReactNode, test: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (!isValidElement<Record<string, unknown>>(node)) return undefined
  if (test(node)) return node
  const kids = node.props.children as ReactNode
  for (const k of Array.isArray(kids) ? (kids as ReactNode[]) : [kids]) {
    const hit = find(k, test)
    if (hit) return hit
  }
  return undefined
}

describe('a site in the list', () => {
  it('shows today’s visitors only, on a mark that carries the state dot', () => {
    const html = row(site(), 1284)
    expect(html).toContain('<b>1,284</b>')
    expect(html).toContain('title="1,284 today"')
    expect(html).not.toContain(' now<')
    expect(html).toMatch(/class="mkwrap">.*class="mk-dot/)
    expect(html).not.toContain('vf-seal')
  })

  it('says setup, or how long it has been down or quiet, in the number’s place', () => {
    expect(row(site({ last_event_at: undefined }), 0)).toContain('Not verified')
    const gone = row(site({ last_event_at: NOW - 3 * 86400, check: { at: NOW - 3600, error: 'example.com could not be reached over https' } }))
    expect(gone).toContain('state-word down')
    expect(gone).toContain('down 3d')
    expect(gone).toContain('title="Not reachable for 3d. Open the site to see what’s wrong."')
    expect(gone).toContain('mk-dot down')
    expect(gone).not.toContain('<b>')
    const quiet = row(site({ last_event_at: NOW - 7 * 3600, check: { at: NOW - 3600, found: 'none' } }))
    expect(quiet).toContain('state-word quiet')
    expect(quiet).toContain('quiet 7h')
    expect(quiet).toContain('mk-dot idle')
    expect(row(site({ last_event_at: NOW - 3600 }), 5)).toContain('<b>5</b>')
  })

  it('names the domain only when another site has the same name', () => {
    expect(row(site())).not.toContain('class="d')
    expect(renderToStaticMarkup(<SiteRow clash site={site({ name: 'Blog', domain: 'blog.tash.al' })} place={{ kind: 'rest' }} on={false} arrange={null} onPick={noop} />)).toContain('>blog.tash.al<')
  })

  it('marks the site you are on with aria-current', () => {
    const html = renderToStaticMarkup(<SiteRow site={site()} place={{ kind: 'rest' }} on={true} arrange={null} onPick={noop} />)
    expect(html).toContain('aria-current="page"')
  })
})

describe('a site that is being handed to someone', () => {
  it('says so on its row, with a Stop, instead of its state', () => {
    const move = { text: 'Moving to a@b.c', title: 'Waiting for a@b.c', stopLabel: 'Stop moving x', stopWord: 'Stop', stop: () => {} }
    const html = renderToStaticMarkup(<SiteRow site={site()} place={{ kind: 'rest' }} on={false} arrange={null} move={move} onPick={noop} />)
    expect(html).toContain('Moving to a@b.c')
    expect(html).toContain('sw-stop')
    expect(html).toContain('mk-dot quiet')
  })
})

describe('the open-site link on a row', () => {
  afterEach(() => vi.unstubAllGlobals())
  const pick = vi.fn()
  const tree = () => SiteRow({ site: site(), place: { kind: 'rest' }, on: false, arrange: null, onPick: pick })

  it('links to the site in a new tab, with the domain in its tooltip', () => {
    const html = renderToStaticMarkup(<OpenSite domain="example.com" />)
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('title="Open example.com"')
  })

  it('is left out for a site without a domain', () => {
    expect(renderToStaticMarkup(<OpenSite domain="" />)).toBe('')
    expect(row(site({ domain: '' }))).not.toContain('site-open')
  })

  it('is clicked without switching the site', () => {
    expect(find(tree(), (e) => e.type === OpenSite)).toBeDefined()
    const el = (OpenSite as (p: { domain: string }) => ReactElement<{ onClick: (e: unknown) => void }>)({ domain: 'example.com' })
    const stop = vi.fn()
    el.props.onClick({ stopPropagation: stop })
    expect(stop).toHaveBeenCalled()
    expect(pick).not.toHaveBeenCalled()
  })

  it('opens the site on Shift + Enter, and not on Enter alone', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    const btn = find(tree(), (e) => e.type === 'button' && typeof e.props.onKeyDown === 'function')
    const onKeyDown = btn?.props.onKeyDown as (e: unknown) => void
    const preventDefault = vi.fn()
    onKeyDown({ key: 'Enter', shiftKey: true, altKey: false, preventDefault })
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    expect(preventDefault).toHaveBeenCalled()
    open.mockClear()
    onKeyDown({ key: 'Enter', shiftKey: false, altKey: false, preventDefault })
    expect(open).not.toHaveBeenCalled()
  })
})

describe('the arrange menu at the edges of a list', () => {
  const sites = [site({ id: 'a' }), site({ id: 'b' }), site({ id: 'c' })]
  const arrange = { sites, layout: { pinned: [], groups: [], order: ['a', 'b', 'c'] }, save: noop, drag: null, grab: noop } as never
  const items = (id: string) => {
    const menu = RowMenu({ site: sites.find((s) => s.id === id) as Site, place: { kind: 'rest' }, a: arrange, step: noop }) as ReactElement<{ children: (c: () => void) => ReactNode }>
    return renderToStaticMarkup(<>{menu.props.children(noop)}</>)
  }
  it('offers no Move up on the first site and no Move down on the last', () => {
    expect(items('a')).not.toContain('Move up')
    expect(items('a')).toContain('Move down')
    expect(items('c')).not.toContain('Move down')
    expect(items('c')).toContain('Move up')
    expect(items('b')).toContain('Move up')
    expect(items('b')).toContain('Move down')
  })
})

describe('the ⋯ menu in groups', () => {
  const sites = [site({ id: 'a' }), site({ id: 'b' }), site({ id: 'c' })]
  const arrange = { sites, layout: { pinned: [], groups: [], order: ['a', 'b', 'c'] }, save: noop, drag: null, grab: noop } as never
  const html = (o: { settings?: () => void; status?: () => void; a?: unknown }) => {
    const menu = RowMenu({ site: sites[1], place: { kind: 'rest' }, a: (o.a ?? null) as never, step: noop, settings: o.settings, status: o.status }) as ReactElement<{ children: (c: () => void) => ReactNode }>
    return renderToStaticMarkup(<>{menu.props.children(noop)}</>)
  }
  const order = (h: string) => h.replace(/<div role="separator"[^>]*><\/div>/g, '|').replace(/<[^>]+>/g, '\n').split('\n').filter(Boolean).join(',')

  it('sets settings and Open apart from sharing, and both from arranging, with a thin line between', () => {
    const h = html({ settings: noop, status: noop, a: arrange })
    expect(order(h)).toBe('Site settings,Open example.com,|,Share,Status page,Widgets,|,Pin to top,Move up,Move down,New group…')
    expect((h.match(/role="separator"/g) ?? []).length).toBe(2)
  })

  it('drops a line when its group is empty for the role', () => {
    expect(order(html({ settings: noop, status: noop }))).toBe('Site settings,Open example.com,|,Share,Status page,Widgets')
    expect(order(html({ a: arrange }))).toBe('Open example.com,|,Pin to top,Move up,Move down,New group…')
  })
})

