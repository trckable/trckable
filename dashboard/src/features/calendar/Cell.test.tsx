// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cell, type CellProps } from './Cell'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const base: CellProps = {
  day: { day: '2026-09-07', visitors: 1240, usual: 927, revenue: 12600, sales: 3, hours: [1, 2, 3, 9, 4, 2] },
  today: '2026-09-20',
  heat: 0.6,
  moments: [
    { t: '2026-09-07T00:00', kind: 'spike', visitors: 1240, factor: 3.4 },
    { t: '2026-09-07T13:00', kind: 'sale', count: 3, amount: 12600 },
  ],
  notes: [{ id: 'n1', day: '2026-09-07', text: 'Newsletter: pricing', created_at: 0 }],
  selected: false,
  tab: true,
  plans: true,
  money: { currency: 'USD', exponent: 2 },
  onPick: () => undefined,
}

const render = (p: Partial<CellProps> = {}) => {
  act(() => root.render(<Cell {...base} {...p} />))
  return host.querySelector('.cal-cell') as HTMLButtonElement
}

describe('a finished day', () => {
  it('shows its number, visitors, change, money, hours, moments and note', () => {
    const cell = render()
    expect(cell.querySelector('.cal-d')?.textContent).toBe('7')
    expect(cell.querySelector('.cal-v')?.textContent).toBe('1,240')
    expect(cell.querySelector('.cal-chg')?.textContent).toBe('+34%')
    expect(cell.querySelector('.cal-rev')?.textContent).toBe('$126')
    expect(cell.querySelector('.cal-spark polyline')?.getAttribute('points')).toBeTruthy()
    expect(cell.querySelectorAll('.cal-ic').length).toBe(2)
    expect(cell.querySelector('.cal-chip')?.textContent).toBe('Newsletter: pricing')
    expect(cell.style.getPropertyValue('--h')).toBe('0.6')
    expect(cell.getAttribute('aria-label')).toBe('Mon, Sep 7: 1,240 visitors')
  })
  it('shows a down change as down, and no money when there is none', () => {
    const cell = render({ day: { ...base.day, visitors: 700, revenue: undefined, sales: undefined } })
    expect(cell.querySelector('.cal-chg')?.className).toContain('down')
    expect(cell.querySelector('.cal-chg')?.textContent).toBe('−24%')
    expect(cell.querySelector('.cal-rev')).toBeNull()
  })
  it('scores a planned day against its usual weekday', () => {
    const plan = { id: 'p1', day: '2026-09-07', text: 'Show HN', created_at: 0, planned: true }
    const cell = render({ notes: [plan] })
    expect(cell.querySelector('.cal-chip.plan')?.textContent).toBe('Show HN')
    expect(cell.querySelector('.cal-score')?.textContent).toBe('+34% vs a usual Mon')
  })
  it('opens its day when pressed', () => {
    const onPick = vi.fn()
    render({ onPick }).click()
    expect(onPick).toHaveBeenCalledWith('2026-09-07')
  })
})

describe('a day to come', () => {
  const later = { day: { day: '2026-09-27', visitors: 0, usual: 480 }, moments: [], notes: [] }
  it('is dashed, says what the weekday usually brings, and offers a plan', () => {
    const cell = render(later)
    expect(cell.className).toContain('future')
    expect(cell.querySelector('.cal-soon')?.textContent).toBe('~480 expected')
    expect(cell.querySelector('.cal-plus')).not.toBeNull()
    expect(cell.querySelector('.cal-spark')).toBeNull()
  })
  it('offers no plan to someone who cannot add one', () => {
    expect(render({ ...later, plans: false }).querySelector('.cal-plus')).toBeNull()
  })
})
