// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const report = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('../../lib/api', () => ({ api: { report: (...a: unknown[]) => report(...a) } }))

import HeatModal from './HeatModal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  report.mockResolvedValue({ current: { series: [1, 4, 9, 3].map((v) => ({ t: '2026-10-05T10:00', visitors: v, pageviews: v })) } })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the heatmaps dialog', () => {
  it('tells today’s views of the page by the hour, what a heatmap shows, and can preview or turn it on', async () => {
    const onPreview = vi.fn()
    const onGo = vi.fn()
    act(() => root.render(<HeatModal site={{ id: 's1', timezone: 'UTC' }} path="/pricing" views={412} onClose={vi.fn()} onPreview={onPreview} onGo={onGo} />))
    for (let i = 0; i < 40 && !document.body.querySelector('[role="dialog"] svg[role="img"]'); i++) await act(() => new Promise((r) => setTimeout(r, 25)))
    const dlg = (document.body.querySelector('[role="dialog"]') as HTMLElement)
    expect(report.mock.calls[0][1]).toMatchObject({ bucket: 'hour', filters: [{ dim: 'page', value: '/pricing' }] })
    expect(dlg.querySelector('.cm-title')?.textContent).toBe('412views today')
    expect(dlg.querySelector('.cm-part h3')?.textContent).toBe('/pricing')
    expect(dlg.querySelector('.cm-meaning')?.textContent).toContain('Nobody is recorded')
    const [preview, go] = [...dlg.querySelectorAll<HTMLButtonElement>('.cm-actions button')]
    act(() => preview.click())
    act(() => go.click())
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onGo).toHaveBeenCalledTimes(1)
  })
})
