// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiPage, AiSearchReport } from '../../lib/apiMore'

const aiSearch = vi.fn<(...a: unknown[]) => Promise<AiSearchReport>>()
const searchReport = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('../../lib/apiMore', async (orig) => ({
  ...(await orig<typeof import('../../lib/apiMore')>()),
  more: { aiSearch: (...a: unknown[]) => aiSearch(...a), searchReport: (...a: unknown[]) => searchReport(...a) },
}))
const openSettings = vi.fn<(...a: unknown[]) => void>()
vi.mock('../../lib/settings', () => ({ openSettings: (...a: unknown[]) => openSettings(...a) }))

import { whoTabs } from '../cards/base'
import type { CardsCtx } from '../cards/ctx'
import AiSearch from './AiSearch'
import { PageRatio } from './PageRatio'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const draw = (ui: React.ReactNode) => act(() => root.render(ui))
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const text = (el: Element | null) => el?.textContent ?? ''

const report = (over: Partial<AiSearchReport> = {}): AiSearchReport => ({
  visitors: 15,
  referrers: [
    { value: 'chatgpt.com', visitors: 9 },
    { value: 'chat.openai.com', visitors: 1 },
    { value: 'claude.ai', visitors: 5 },
  ],
  crawled: 440,
  bots: [
    { name: 'OpenAI', kind: 'train', hits: 400 },
    { name: 'Anthropic', kind: 'answer', hits: 40 },
  ],
  pages: [
    { path: '/pricing', read: 400, sent: 12 },
    { path: '/docs', read: 40, sent: 0, flag: 'uncredited' },
    { path: '/guide', read: 0, sent: 0, clicks: 80, flag: 'unread' },
  ],
  crawlers: true,
  google: true,
  ...over,
})

const ctx = (over: Partial<CardsCtx> = {}, addFilter = vi.fn()) =>
  ({ site: { id: 's1', domain: 'site.com', timezone: 'UTC', proxy_key: 'k' }, query: { from: '2026-09-07', to: '2026-09-13' }, full: true, shared: false, mods: { search: true }, addFilter, ...over }) as unknown as CardsCtx

beforeEach(() => {
  aiSearch.mockReset()
  searchReport.mockReset()
  openSettings.mockReset()
  searchReport.mockResolvedValue({ rows: [{ key: 'self hosted analytics', clicks: 31, impressions: 620, ctr: 0.05, position: 4.4 }], clicks: 31, impressions: 620 })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the AI & Search tab', () => {
  it('is in Full, in Compact once Search Console is on, and never on a shared link', () => {
    const ids = (c: CardsCtx) => whoTabs(c).map((t) => t.id)
    expect(ids(ctx({ full: true, mods: {} }))).toContain('ai-search')
    expect(ids(ctx({ full: false, mods: { search: true } }))).toContain('ai-search')
    expect(ids(ctx({ full: false, mods: {} }))).not.toContain('ai-search')
    expect(ids(ctx({ full: true, shared: true }))).not.toContain('ai-search')
  })

  it('has the three columns: Google, AI assistants (grouped by assistant) and AI crawlers', async () => {
    aiSearch.mockResolvedValue(report())
    draw(<AiSearch c={ctx()} />)
    await settle()
    const cols = [...host.querySelectorAll('.ais-col')]
    expect(cols.map((c) => text(c.querySelector('.ais-head span')))).toEqual(['Google', 'AI assistants', 'AI crawlers'])
    expect(text(cols[0])).toContain('self hosted analytics')
    // chatgpt.com and chat.openai.com are one assistant.
    const assistants = [...cols[1].querySelectorAll('.bl-row')].map((r) => text(r.querySelector('.bl-text')))
    expect(assistants).toEqual(['ChatGPT', 'Claude'])
    expect(text(cols[1].querySelector('.ais-head b'))).toBe('15')
    expect(text(cols[2])).toContain('OpenAI')
    expect(text(cols[2].querySelector('.ais-head b'))).toBe('440')
    expect(aiSearch).toHaveBeenCalledTimes(1)
  })

  it('a click on an assistant filters by its referrer, like every other list', async () => {
    aiSearch.mockResolvedValue(report())
    const addFilter = vi.fn()
    draw(<AiSearch c={ctx({}, addFilter)} />)
    await settle()
    act(() => host.querySelectorAll<HTMLElement>('.ais-col')[1].querySelector<HTMLElement>('.bl-row')?.click())
    expect(addFilter).toHaveBeenCalledWith('referrer', 'chatgpt.com')
  })

  it('a click on a page filters by that page', async () => {
    aiSearch.mockResolvedValue(report())
    const addFilter = vi.fn()
    draw(<AiSearch c={ctx({}, addFilter)} />)
    await settle()
    act(() => host.querySelector<HTMLElement>('.ais-pg-main')?.click())
    expect(addFilter).toHaveBeenCalledWith('page', '/pricing')
  })

  it('asks the server once for the period and filters on screen, and again when they change', async () => {
    aiSearch.mockResolvedValue(report())
    draw(<AiSearch c={ctx()} />)
    await settle()
    draw(<AiSearch c={ctx({ query: { from: '2026-09-07', to: '2026-09-13', filters: [{ dim: 'page', value: '/docs' }] } })} />)
    await settle()
    expect(aiSearch).toHaveBeenCalledTimes(2)
    expect(aiSearch.mock.calls[1][1]).toMatchObject({ filters: [{ dim: 'page', value: '/docs' }] })
  })

  it('without Search Console the Google column is one Connect button, no sentence', async () => {
    aiSearch.mockResolvedValue(report())
    searchReport.mockRejectedValue(Object.assign(new Error('Search Console is not connected'), { message: 'Search Console is not connected' }))
    draw(<AiSearch c={ctx()} />)
    await settle()
    const col = host.querySelectorAll('.ais-col')[0]
    expect(col.querySelectorAll('button')).toHaveLength(1)
    expect(text(col.querySelector('button'))).toBe('Connect')
    act(() => col.querySelector<HTMLElement>('button')?.click())
    expect(openSettings).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'search')
  })

  it('with no crawler data the crawler column offers the setup sheet, and nothing else to read', async () => {
    aiSearch.mockResolvedValue(report({ crawled: 0, bots: [], pages: [], crawlers: false }))
    draw(<AiSearch c={ctx()} />)
    await settle()
    const col = host.querySelectorAll('.ais-col')[2]
    expect(text(col.querySelector('.btn'))).toBe('Connect crawler data')
    expect(col.querySelector('.ais-pages')).toBeNull()
  })

  it('says so when it cannot be read', async () => {
    aiSearch.mockRejectedValue(new Error('boom'))
    draw(<AiSearch c={ctx()} />)
    await settle()
    expect(text(host)).toContain('Couldn’t read AI & Search.')
  })
})

describe('the ratio and its two badges', () => {
  const pages: AiPage[] = report().pages

  it('says in words what the two small numbers mean', () => {
    draw(<PageRatio pages={pages} onPick={vi.fn()} />)
    const first = host.querySelector('.ais-pg-main')
    expect(first?.getAttribute('aria-label')).toBe('/pricing: AI read this 400 times, sent 12 visitors')
    expect(text(first?.querySelector('.ais-pg-nums') ?? null)).toBe('40012')
  })

  it('singular where it is one', () => {
    draw(<PageRatio pages={[{ path: '/a', read: 1, sent: 1 }]} onPick={vi.fn()} />)
    expect(host.querySelector('.ais-pg-main')?.getAttribute('aria-label')).toBe('/a: AI read this 1 time, sent 1 visitor')
  })

  it('flags a page AI reads and never credits, and one Google ranks that AI ignores; no badge for the rest', () => {
    draw(<PageRatio pages={pages} onPick={vi.fn()} />)
    const rows = [...host.querySelectorAll('.ais-pg')]
    expect(rows.map((r) => text(r.querySelector('.ais-flag')))).toEqual(['', 'No credit', 'Not read'])
    expect(rows[1].querySelector('.ais-flag')?.className).toContain('uncredited')
    expect(rows[2].querySelector('.ais-flag')?.className).toContain('unread')
  })

  it('a badge explains itself on hover or focus, with the numbers', () => {
    draw(<PageRatio pages={pages} onPick={vi.fn()} />)
    const badge = host.querySelectorAll('.ais-pg')[2].querySelector<HTMLElement>('.info-badge')
    expect(badge?.getAttribute('aria-label')).toBe('Google sent 80 clicks to this page and no AI crawler read it in this period.')
    act(() => badge?.focus())
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('80 clicks')
    expect(host.querySelectorAll('.ais-pg')[1].querySelector('.info-badge')?.getAttribute('aria-label')).toContain('read this page 40 times and sent nobody')
  })

  it('shows nothing for no pages', () => {
    draw(<PageRatio pages={[]} onPick={vi.fn()} />)
    expect(host.querySelector('.ais-pages')).toBeNull()
  })
})
