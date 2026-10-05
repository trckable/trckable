// @vitest-environment happy-dom
import { Search } from 'lucide-react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/url', () => ({ readView: () => ({ period: '7d', filters: [] }), setView: vi.fn() }))

import DiscoverModal from './DiscoverModal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const series = [3, 5, 2, 8, 1].map((visitors, i) => ({ t: `2026-10-0${i + 1}`, visitors, pageviews: visitors }))
const text = { label: 'Search Console', title: 'See what people search for', go: 'Connect' }

describe('the guide card dialog', () => {
  it('tells the period’s visitors as a line with their total, one line on what it is, and the card’s action', () => {
    const onGo = vi.fn()
    act(() => root.render(<DiscoverModal id="search" Icon={Search} tint="var(--ch-1)" text={text} tz="UTC" series={series} onClose={vi.fn()} onGo={onGo} />))
    const dlg = (document.body.querySelector('[role="dialog"]') as HTMLElement)
    expect(dlg.querySelector('.cm-title')?.textContent).toBe('See what people search for')
    expect(dlg.querySelector('.cm-part h3')?.textContent).toBe('19 visitors')
    expect(dlg.querySelector('svg[role="img"]')).not.toBeNull()
    expect(dlg.querySelector('.cm-meaning')?.textContent).toContain('Google Search Console')
    const go = [...dlg.querySelectorAll<HTMLButtonElement>('.cm-actions button')].find((b) => b.textContent === 'Connect')
    act(() => go?.click())
    expect(onGo).toHaveBeenCalledTimes(1)
  })
  it('draws no chart and no period for a site with nothing yet, and keeps the action off while busy', () => {
    act(() => root.render(<DiscoverModal id="weekly" Icon={Search} tint="var(--ch-5)" text={{ ...text, go: 'Turn on' }} tz="UTC" series={[]} busy onClose={vi.fn()} onGo={vi.fn()} />))
    const dlg = (document.body.querySelector('[role="dialog"]') as HTMLElement)
    expect(dlg.querySelector('svg[role="img"]')).toBeNull()
    expect(dlg.querySelector('.cm-when')).toBeNull()
    expect((dlg.querySelector('.cm-actions .btn.primary') as HTMLButtonElement).disabled).toBe(true)
    expect(dlg.querySelector('.cm-meaning')?.textContent).toContain('a week')
  })
})
