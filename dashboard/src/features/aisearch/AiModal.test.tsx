// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aiSearch = vi.fn<(...a: unknown[]) => Promise<unknown>>()
const report = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('../../lib/apiMore', () => ({ more: { aiSearch: (...a: unknown[]) => aiSearch(...a) } }))
vi.mock('../../lib/api', () => ({ api: { report: (...a: unknown[]) => report(...a) } }))
vi.mock('../../lib/url', () => ({ readView: () => ({ period: '30d', filters: [] }), setView: vi.fn() }))

import AiModal from './AiModal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const rep = {
  visitors: 20,
  crawled: 140,
  crawlers: true,
  google: false,
  referrers: [
    { value: 'chatgpt.com', visitors: 12 },
    { value: 'perplexity.ai', visitors: 5 },
    { value: 'claude.ai', visitors: 3 },
  ],
  bots: [{ name: 'GPTBot', kind: 'train', hits: 100 }, { name: 'ClaudeBot', kind: 'train', hits: 40 }],
  pages: [
    { path: '/blog/self-hosting', read: 90, sent: 9 },
    { path: '/pricing', read: 10, sent: 7 },
    { path: '/docs', read: 40, sent: 0 },
  ],
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  aiSearch.mockResolvedValue(rep)
  report.mockResolvedValue({ current: { series: [0, 1, 0, 4, 9, 2, 4].map((v) => ({ t: '2026-10-01', visitors: v, pageviews: v })) } })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

async function draw(seen: 'visitor' | 'crawler', onGo = vi.fn(), onClose = vi.fn()) {
  act(() => root.render(<AiModal site={{ id: 's1', timezone: 'UTC' }} seen={seen} onClose={onClose} onGo={onGo} />))
  for (let i = 0; i < 40 && !document.body.querySelector('[role="dialog"] .cm-bars'); i++) await act(() => new Promise((r) => setTimeout(r, 25)))
  return { onGo, onClose, dlg: document.body.querySelector('[role="dialog"]') as HTMLElement }
}

describe('the AI & Search dialog', () => {
  it('names the assistants with their counts and a bar each, the pages they landed on, the days and what it means', async () => {
    const { dlg } = await draw('visitor')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.querySelector('.cm-title')?.textContent).toBe('20visitors from AI')
    const rows = [...dlg.querySelectorAll('.cm-bars')[0].querySelectorAll('li')]
    expect(rows.map((r) => r.querySelector('.cm-row')?.textContent)).toEqual(['ChatGPT12', 'Perplexity5', 'Claude3'])
    expect(rows.every((r) => r.querySelector('i'))).toBe(true)
    expect([...dlg.querySelectorAll('.cm-bars')[1].querySelectorAll('li')].map((r) => r.querySelector('.cm-row')?.textContent)).toEqual(['/blog/self-hosting9', '/pricing7'])
    expect(dlg.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe('AI visitors for each day of the period')
    expect(dlg.querySelector('.cm-meaning')?.textContent).toContain('followed the link')
  })
  it('asks the report for AI visitors only, for the dashboard’s period', async () => {
    await draw('visitor')
    const [site, q] = report.mock.calls[0] as [string, { filters: unknown[] }]
    expect(site).toBe('s1')
    expect(q.filters).toEqual([{ dim: 'channel', value: 'AI' }])
    expect(aiSearch.mock.calls[0][0]).toBe('s1')
  })
  it('See all in AI & Search is the way on; Close only closes', async () => {
    const { dlg, onGo, onClose } = await draw('visitor')
    const buttons = [...dlg.querySelectorAll<HTMLButtonElement>('.cm-actions button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['Close', 'See all in AI & Search'])
    act(() => buttons[0].click())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onGo).not.toHaveBeenCalled()
    act(() => buttons[1].click())
    expect(onGo).toHaveBeenCalledTimes(1)
  })
  it('tells a crawler by the robots and the pages they read', async () => {
    const { dlg } = await draw('crawler')
    expect(dlg.querySelector('.cm-title')?.textContent).toBe('140reads by AI crawlers')
    expect([...dlg.querySelectorAll('.cm-bars')[0].querySelectorAll('li')].map((r) => r.querySelector('.cm-row')?.textContent)).toEqual(['GPTBot100 reads', 'ClaudeBot40 reads'])
    expect([...dlg.querySelectorAll('.cm-bars')[1].querySelectorAll('li')].map((r) => r.querySelector('.cm-name')?.textContent)).toEqual(['/blog/self-hosting', '/docs', '/pricing'])
    expect(dlg.querySelector('.cm-meaning')?.textContent).toContain('not counted as visitors')
  })
  it('closes on Escape', async () => {
    const { onClose } = await draw('visitor')
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('says so when the report cannot be read', async () => {
    aiSearch.mockRejectedValue(new Error('x'))
    act(() => root.render(<AiModal site={{ id: 's1', timezone: 'UTC' }} seen="visitor" onClose={vi.fn()} onGo={vi.fn()} />))
    for (let i = 0; i < 40 && !document.body.querySelector('.kit-empty'); i++) await act(() => new Promise((r) => setTimeout(r, 25)))
    expect(document.body.querySelector('.kit-empty')?.textContent).toBe('Couldn’t read AI & Search.')
  })
})
