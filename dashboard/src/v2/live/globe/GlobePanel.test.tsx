// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Row } from '../../../features/live/model'
import type { Globe } from './engine'
import GlobePanel from './GlobePanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = (i: number, o: Partial<Row> = {}): Row => ({ kind: 'pageview', ts: 90_000, last: 99_000 - i, path: `/p${i}`, key: `k${i}`, country: 'de', city: 'Berlin', device: 'desktop', ...o })

beforeAll(() => {
  const still = class {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', still)
  vi.stubGlobal('IntersectionObserver', still)
})
afterEach(() => vi.restoreAllMocks())

const mount = (rows: Row[]) => {
  const box = document.createElement('div')
  document.body.append(box)
  const root = createRoot(box)
  const show = (r: Row[]) => {
    act(() => root.render(<GlobePanel rows={r} clock={100_000} online={r.length} bar={null} pulse="" site="s" />))
  }
  show(rows)
  const globe = () => (box.querySelector('canvas') as HTMLCanvasElement & { __globe: Globe }).__globe
  return { box, globe, show, root }
}

describe('the globe popover', () => {
  it('opens a visitor from the list, holds the globe still, and closing lets it spin again', () => {
    const { box, globe, root } = mount([row(1), row(2)])
    expect(box.querySelector('[role=dialog]')).toBeNull()
    expect(globe().held).toBe(false)
    act(() => (box.querySelectorAll('.gfeed .lv')[1] as HTMLElement).click())
    const dialog = box.querySelector('[role=dialog]')
    expect(dialog?.textContent).toContain('/p2') // that visitor's card, with no list in between
    expect(dialog?.getAttribute('aria-label')).toContain('Berlin')
    expect(globe().held).toBe(true)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(box.querySelector('[role=dialog]')).toBeNull()
    expect(globe().held).toBe(false)
    act(() => (box.querySelector('.gfeed .lv') as HTMLElement).click())
    expect(globe().held).toBe(true)
    act(() => (box.querySelector('.gpop-x') as HTMLElement).click())
    expect(globe().held).toBe(false)
    act(() => root.unmount())
  })

  it('says so when the visitor has left, and then closes', () => {
    vi.useFakeTimers()
    const { box, show, globe, root } = mount([row(1)])
    act(() => (box.querySelector('.gfeed .lv') as HTMLElement).click())
    act(() => show([]))
    expect(box.querySelector('.gwho')?.textContent).toContain('Left just now')
    expect(box.querySelector('[role=dialog]')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(box.querySelector('[role=dialog]')).toBeNull()
    expect(globe().held).toBe(false)
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('full screen shows the new visitors, newest first, and a click opens that visitor', () => {
    const { box, root } = mount([row(1), row(2), row(3)])
    expect(box.querySelector('.gnew')).toBeNull()
    act(() => (box.querySelector('.gfs') as HTMLElement).click())
    const items = [...box.querySelectorAll('.gnew .gnv')]
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('/p1')
    act(() => (items[2] as HTMLElement).click())
    expect(box.querySelector('[role=dialog]')?.textContent).toContain('/p3')
    act(() => (box.querySelector('.gclose') as HTMLElement).click())
    expect(box.querySelector('.gnew')).toBeNull()
    act(() => root.unmount())
  })
})
