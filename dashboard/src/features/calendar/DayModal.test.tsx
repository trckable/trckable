// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DayModal from './DayModal'
import type { CalDay, CalMonth } from './model'

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

const day: CalDay = { day: '2026-10-03', visitors: 150, usual: 100, sales: 2, revenue: 5000, hours: Array.from({ length: 24 }, (_, h) => (h === 14 ? 40 : 5)), source: 'Search', page: '/pricing' }
const month: CalMonth = { month: '2026-10', today: '2026-10-05', days: [day], moments: [], notes: [], filtered: false, weekday_avg: [], currency: 'USD', exponent: 2 }

describe('the day dialog', () => {
  it('tells the day against its usual, by the hour, with its source, page and sales, and opens the day from its main button', () => {
    const onOpen = vi.fn()
    act(() => root.render(<DayModal day={day} month={month} moments={[]} onClose={vi.fn()} onOpen={onOpen} />))
    const dlg = (document.body.querySelector('[role="dialog"]') as HTMLElement)
    expect(dlg.querySelector('.cm-title')?.textContent).toContain('150')
    expect(dlg.querySelector('.cm-title')?.textContent).toContain('+50%')
    expect(dlg.querySelector('svg[role="img"]')).not.toBeNull()
    expect(dlg.querySelector('.cal-facts')?.textContent).toContain('/pricing')
    expect(dlg.querySelector('.cal-facts')?.textContent).toContain('$50.00')
    act(() => dlg.querySelector<HTMLButtonElement>('.cm-actions .btn.primary')?.click())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
