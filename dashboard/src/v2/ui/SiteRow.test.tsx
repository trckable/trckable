import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { OpenSite } from '../../features/sites/OpenSite'
import { stateLine } from '../../features/sites/stateLine'
import { Moves, SiteRow } from './SiteRow'

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

  it('says setup, down or quiet in the number’s place', () => {
    expect(row(site({ last_event_at: undefined }), 0)).toContain('setup')
    const gone = row(site({ last_event_at: NOW - 3 * 86400, check: { at: NOW - 3600, error: 'example.com could not be reached over https' } }))
    expect(gone).toContain('state-icon down')
    expect(gone).toContain('aria-label="Not reachable for 3d. Open the site to see what’s wrong."')
    expect(gone).toContain('mk-dot down')
    expect(gone).not.toContain('<b>')
    const quiet = row(site({ last_event_at: NOW - 7 * 3600, check: { at: NOW - 3600, found: 'none' } }))
    expect(quiet).toContain('state-icon quiet')
    expect(quiet).toContain('mk-dot quiet')
    expect(quiet).toContain('aria-label="No visits for 7h. Nothing looks wrong with the page."')
    expect(row(site({ last_event_at: NOW - 3600 }), 5)).toContain('<b>5</b>')
  })

  it('puts the state in words under the name, and the domain under a name that is not it', () => {
    expect(row(site({ last_event_at: NOW - 7 * 3600, check: { at: NOW - 3600, found: 'none' } }))).toContain('Quiet · 7h')
    expect(row(site())).toContain('>example.com<')
    expect(row(site({ name: 'example.com' }))).not.toContain('class="d')
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

describe('the state line under a site name', () => {
  const down = { check: { at: NOW, error: 'unreachable' } }
  it('says how long a down site has been unreachable', () => {
    expect(stateLine(site({ ...down, last_event_at: NOW - 2 * 86400 - 600 }))).toBe('Not reachable · 2d')
  })
  it('says how long a quiet site has had no visits', () => {
    expect(stateLine(site({ last_event_at: NOW - 8 * 3600 }))).toBe('Quiet · 8h')
  })
  it('is empty for a live and for a new site', () => {
    expect(stateLine(site({ last_event_at: NOW - 3600 }))).toBeNull()
    expect(stateLine(site({ last_event_at: undefined }))).toBeNull()
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
    const menu = Moves({ site: sites.find((s) => s.id === id) as Site, place: { kind: 'rest' }, a: arrange, step: noop }) as ReactElement<{ children: (c: () => void) => ReactNode }>
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
