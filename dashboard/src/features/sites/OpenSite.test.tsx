import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { OpenSite } from './OpenSite'
import { SiteItem } from './SiteItem'

const site = (o: Partial<Site> = {}): Site => ({ id: 's1', domain: 'albas.al', name: 'Albas', timezone: 'UTC', currency: 'USD', proxy_key: '', ...o })

// SiteItem and OpenSite hold no state, so they can be called as plain functions
// and their element trees walked for handlers.
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

describe('the open-site link on a row', () => {
  afterEach(() => vi.unstubAllGlobals())
  const pick = vi.fn()
  const tree = () => SiteItem({ site: site(), place: { kind: 'rest' }, on: false, arrange: null, onPick: pick })

  it('links to the site in a new tab, with the domain in its tooltip', () => {
    const html = renderToStaticMarkup(<OpenSite domain="albas.al" />)
    expect(html).toContain('href="https://albas.al"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('title="Open albas.al"')
  })

  it('is left out for a site without a domain', () => {
    expect(renderToStaticMarkup(<OpenSite domain="" />)).toBe('')
    expect(renderToStaticMarkup(<SiteItem site={site({ domain: '' })} place={{ kind: 'rest' }} on={false} arrange={null} onPick={pick} />)).not.toContain('site-open')
  })

  it('is clicked without switching the site', () => {
    const link = find(tree(), (e) => e.type === OpenSite)
    expect(link).toBeDefined()
    const el = (OpenSite as (p: { domain: string }) => ReactElement<{ onClick: (e: unknown) => void }>)({ domain: 'albas.al' })
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
    expect(open).toHaveBeenCalledWith('https://albas.al', '_blank', 'noopener,noreferrer')
    expect(preventDefault).toHaveBeenCalled()
    open.mockClear()
    onKeyDown({ key: 'Enter', shiftKey: false, altKey: false, preventDefault })
    expect(open).not.toHaveBeenCalled()
  })
})
