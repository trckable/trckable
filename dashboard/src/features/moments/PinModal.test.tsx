// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ ownDays: vi.fn(() => Promise.resolve({ values: [], days: [] })) }))
vi.mock('../../lib/api', async (orig) => ({ ...(await orig<typeof import('../../lib/api')>()), call: vi.fn(() => Promise.resolve({ icons: [] })) }))

import PinModal from './PinModal'
import type { Pin } from './pins'

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

const pin: Pin = { id: 'spike:2026-09-19T00:00', kind: 'spike', score: 90, day: '2026-09-19', filters: [{ dim: 'referrer', value: 'news.example' }], showDay: true, n: { factor: 4.2, visitors: 816, referrer: 'news.example' } }
const series = ['15', '16', '17', '18', '19', '20', '21'].map((d, i) => ({ t: `2026-09-${d}T00:00`, visitors: i === 4 ? 816 : 190, pageviews: 1 }))

describe('the one-thing dialog', () => {
  it('tells the moment in full and shows it on the dashboard from its main button', () => {
    const onSee = vi.fn()
    act(() => root.render(<PinModal pin={pin} site={{ id: 's1', timezone: 'UTC' }} series={series} money={(n) => `$${n}`} onClose={vi.fn()} onSee={onSee} />))
    const dlg = (document.body.querySelector('[role="dialog"]') as HTMLElement)
    expect(dlg.querySelector('.cm-kind')?.textContent).toBe('Traffic spike')
    expect(dlg.querySelector('.cm-title')?.textContent).toContain('816')
    expect(dlg.querySelector('.cm-title')?.textContent).toContain('4.2×')
    expect(dlg.textContent).toContain('news.example')
    expect(dlg.querySelector('.side-chart')).not.toBeNull()
    const see = dlg.querySelector<HTMLButtonElement>('.cm-actions .btn.primary')
    expect(see?.textContent).toBe('Show Sep 19')
    act(() => see?.click())
    expect(onSee).toHaveBeenCalledTimes(1)
  })
})
