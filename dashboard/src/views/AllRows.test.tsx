import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteRow } from '../lib/api'
import { AllRows, openOnShiftEnter } from './AllRows'

const row = (o: Partial<SiteRow> = {}): SiteRow =>
  ({ id: 's1', domain: 'example.com', name: 'Example', timezone: 'UTC', currency: 'USD', visitors: 10, previous_visitors: 8, pageviews: 30, bounce_rate: 0.4, online: 0, series: [1, 2, 3], ...o }) as SiteRow

const html = (layout: 'cards' | 'list', rows: SiteRow[]) =>
  renderToStaticMarkup(<AllRows rows={rows} layout={layout} total={20} start={0} colorOf={() => '#000'} brandOf={(_, domain) => ({ domain })} />)

describe('the open-site link on All sites', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['cards', 'list'] as const)('sits beside every row in the %s layout, outside the row button', (layout) => {
    const out = html(layout, [row(), row({ id: 's2', domain: 'b.example', name: 'B', visitors: 0, previous_visitors: 0 })])
    expect(out.match(/class="site-open"/g)).toHaveLength(2)
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('href="https://b.example"')
    expect(out).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*site-open/s)
  })

  it('opens the site on Shift + Enter only', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    const prevent = vi.fn()
    openOnShiftEnter({ key: 'Enter', shiftKey: false, preventDefault: prevent }, 'example.com')
    openOnShiftEnter({ key: 'a', shiftKey: true, preventDefault: prevent }, 'example.com')
    expect(open).not.toHaveBeenCalled()
    openOnShiftEnter({ key: 'Enter', shiftKey: true, preventDefault: prevent }, 'example.com')
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    expect(prevent).toHaveBeenCalledOnce()
  })
})
