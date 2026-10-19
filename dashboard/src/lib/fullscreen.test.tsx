// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enter, useFullscreen } from './fullscreen'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const api = (enabled: boolean) => Object.defineProperty(document, 'fullscreenEnabled', { value: enabled, configurable: true })
afterEach(() => api(false))

describe('full screen', () => {
  it('falls back when the browser has none, refuses, throws, or says yes and does nothing', async () => {
    const el = document.createElement('div')
    const fallback = vi.fn()
    api(false)
    enter(el, fallback)
    expect(fallback).toHaveBeenCalledTimes(1)
    api(true)
    el.requestFullscreen = () => Promise.reject(new Error('no'))
    enter(el, fallback)
    await Promise.resolve()
    await Promise.resolve()
    expect(fallback).toHaveBeenCalledTimes(2)
    el.requestFullscreen = () => {
      throw new Error('no')
    }
    enter(el, fallback)
    expect(fallback).toHaveBeenCalledTimes(3)
    el.requestFullscreen = () => Promise.resolve() // an embedded browser: resolved, fullscreenElement still null
    enter(el, fallback)
    await Promise.resolve()
    await Promise.resolve()
    expect(fallback).toHaveBeenCalledTimes(4)
  })

  it('covers the window itself, and Esc or the same button leaves it', async () => {
    api(true)
    let on = false
    let toggle = () => {}
    function Probe() {
      const ref = useRef<HTMLDivElement>(null)
      const f = useFullscreen(ref)
      on = f.on
      toggle = f.toggle
      return <div ref={ref} />
    }
    const box = document.createElement('div')
    const root = createRoot(box)
    act(() => root.render(<Probe />))
    HTMLElement.prototype.requestFullscreen = () => Promise.resolve()
    await act(async () => {
      toggle()
      await Promise.resolve()
      await Promise.resolve()
    })
    {
      expect(on).toBe(true)
      expect(box.firstElementChild?.classList.contains('fill')).toBe(true)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      })
      expect(on).toBe(false)
      expect(box.firstElementChild?.classList.contains('fill')).toBe(false)
      act(() => root.unmount())
    }
  })
})
