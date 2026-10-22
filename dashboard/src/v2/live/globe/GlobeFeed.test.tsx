// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Row } from '../../../features/live/model'
import { GlobeFeed } from './GlobeFeed'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = (i: number, o: Partial<Row> = {}): Row => ({ kind: 'pageview', ts: 0, last: 100_000 - i * 1000, path: `/p${i}`, visitor: `v${i}`, key: `v${i}`, country: 'de', ...o })

describe('the globe feed', () => {
  it('renders without looping, newest first with its age, an event by name, and a new row slides in', () => {
    const box = document.createElement('div')
    const root = createRoot(box)
    const pick = vi.fn()
    const rows = [row(1), row(2, { kind: 'goal', goal: 'signup', label: 'Signup' })]
    act(() => root.render(<GlobeFeed rows={rows} clock={115_000} active={null} onPick={pick} />))
    const items = [...box.querySelectorAll('.gfeed .lv')]
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('/p1')
    expect(items[0].textContent).toContain('16s ago')
    expect(items[1].textContent).toContain('Signup')
    act(() => (items[0] as HTMLElement).click())
    expect(pick).toHaveBeenCalledWith(rows[0])
    act(() => root.render(<GlobeFeed rows={[row(3, { last: 114_000 }), ...rows]} clock={115_000} active="v3" onPick={pick} />))
    const next = box.querySelectorAll('.gfeed .lv')
    expect(next).toHaveLength(3)
    expect(next[0].className).toContain('arriving')
    expect(next[0].className).toContain(' on')
    act(() => root.unmount())
  })
})
