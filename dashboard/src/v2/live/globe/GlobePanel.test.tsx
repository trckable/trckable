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
  Element.prototype.hasPointerCapture = () => true
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

  describe('zoom', () => {
    const stage = (box: HTMLElement) => box.querySelector('.gstage') as HTMLElement
    const wheel = (el: HTMLElement, o: WheelEventInit) => {
      const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...o })
      // The test DOM leaves the modifier keys out of the event: set them as a browser would.
      for (const k of ['ctrlKey', 'metaKey'] as const) Object.defineProperty(e, k, { value: !!o[k] })
      act(() => void el.dispatchEvent(e))
      return e
    }
    const ptr = (el: HTMLElement, type: string, id: number, x: number, y: number) => act(() => void el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y })))

    it('zooms with Ctrl or Cmd and the wheel, leaves a plain wheel to the page, and stays between 1x and 6x', () => {
      const { box, globe, root } = mount([row(1)])
      const plain = wheel(stage(box), { deltaY: -300, clientX: 10, clientY: 10 })
      expect(plain.defaultPrevented).toBe(false)
      expect(globe().zoomT).toBe(1)
      const pinch = wheel(stage(box), { deltaY: -300, ctrlKey: true, clientX: 10, clientY: 10 })
      expect(globe().zoomT).toBeGreaterThan(1)
      expect(pinch.defaultPrevented).toBe(true)
      for (let i = 0; i < 40; i++) wheel(stage(box), { deltaY: -400, metaKey: true })
      expect(globe().zoomT).toBe(6)
      for (let i = 0; i < 80; i++) wheel(stage(box), { deltaY: 400, metaKey: true })
      expect(globe().zoomT).toBe(1)
      act(() => root.unmount())
    })

    it('zooms with a plain wheel once the globe has focus or is full screen', () => {
      const { box, globe, root } = mount([row(1)])
      act(() => stage(box).focus())
      wheel(stage(box), { deltaY: -300 })
      expect(globe().zoomT).toBeGreaterThan(1)
      act(() => (box.querySelector('.gzoom button:nth-child(2)') as HTMLElement).click())
      act(() => stage(box).blur())
      act(() => (box.querySelector('.gfs') as HTMLElement).click())
      const before = globe().zoomT
      wheel(stage(box), { deltaY: -300 })
      expect(globe().zoomT).toBeGreaterThan(before)
      // Leaving full screen puts it back.
      act(() => (box.querySelector('.gclose') as HTMLElement).click())
      expect(globe().zoomT).toBe(1)
      act(() => root.unmount())
    })

    it('has plus and minus buttons and keys', () => {
      const { box, globe, root } = mount([row(1)])
      act(() => (box.querySelector('[aria-label="Zoom in"]') as HTMLElement).click())
      expect(globe().zoomT).toBeCloseTo(1.6)
      act(() => (box.querySelector('[aria-label="Zoom out"]') as HTMLElement).click())
      expect(globe().zoomT).toBe(1)
      act(() => void stage(box).dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true })))
      expect(globe().zoomT).toBeCloseTo(1.5)
      act(() => void stage(box).dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true })))
      expect(globe().zoomT).toBe(1)
      act(() => root.unmount())
    })

    it('pinches: two fingers moving apart zoom in, together zoom out', () => {
      const { box, globe, root } = mount([row(1)])
      const el = stage(box)
      ptr(el, 'pointerdown', 1, 100, 100)
      ptr(el, 'pointerdown', 2, 200, 100)
      ptr(el, 'pointermove', 2, 300, 100) // 100 apart became 200
      expect(globe().zoomT).toBeCloseTo(2)
      ptr(el, 'pointermove', 2, 150, 100) // 50 apart: half of the start
      expect(globe().zoomT).toBe(1)
      ptr(el, 'pointerup', 2, 150, 100)
      ptr(el, 'pointerup', 1, 100, 100)
      act(() => root.unmount())
    })
  })
})
