// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cell } from './Cell'
import { stepDay } from './model'

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

// The grid's key handling, as CalendarView binds it: the arrow moves focus to the next day, Enter presses it.
function Grid({ onPick }: { onPick: (d: string) => void }) {
  const days = ['2026-09-01', '2026-09-02', '2026-09-09']
  return (
    <div
      role="grid"
      tabIndex={-1}
      onKeyDown={(e) => {
        const from = (e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day
        if (!from) return
        const next = stepDay(from, e.key, '2026-09')
        if (next !== from) document.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus()
      }}
    >
      {days.map((d, i) => (
        <Cell key={d} day={{ day: d, visitors: 10, usual: 10 }} today="2026-09-20" heat={0.2} moments={[]} notes={[]} selected={false} tab={i === 0} plans={false} onPick={onPick} />
      ))}
    </div>
  )
}

const key = (el: Element, k: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })))

describe('the keyboard', () => {
  it('has one tab stop, moves between days with the arrows, and Enter opens the one in focus', () => {
    const onPick = vi.fn()
    act(() => root.render(<Grid onPick={onPick} />))
    const cells = [...host.querySelectorAll<HTMLElement>('[data-day]')]
    expect(cells.map((c) => c.tabIndex)).toEqual([0, -1, -1])
    cells[0].focus()
    key(cells[0], 'ArrowRight')
    expect(document.activeElement).toBe(cells[1])
    key(cells[1], 'ArrowDown')
    expect(document.activeElement).toBe(cells[2])
    key(cells[2], 'ArrowUp')
    expect(document.activeElement).toBe(cells[1])
    // Enter on a button is its click: a day is opened by pressing the cell.
    cells[1].click()
    expect(onPick).toHaveBeenCalledWith('2026-09-02')
  })
})
