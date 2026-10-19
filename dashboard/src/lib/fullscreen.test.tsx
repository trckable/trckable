// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { useFullscreen } from './fullscreen'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount() {
  const state = { on: false, toggle: () => {} }
  function Probe() {
    const ref = useRef<HTMLDivElement>(null)
    const f = useFullscreen(ref)
    state.on = f.on
    state.toggle = f.toggle
    return <div ref={ref} />
  }
  const box = document.createElement('div')
  const root = createRoot(box)
  act(() => root.render(<Probe />))
  return { state, box, root, cover: () => box.firstElementChild?.classList.contains('fill') }
}

const esc = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

describe('full screen', () => {
  // The cover goes up on the click itself, whatever the browser does with its own full screen.
  for (const [name, request] of [
    ['resolves and does nothing', () => Promise.resolve()],
    ['rejects', () => Promise.reject(new Error('no'))],
    ['throws', () => { throw new Error('no') }],
    ['never answers', () => new Promise<void>(() => {})],
    ['is missing', undefined],
  ] as const) {
    it(`covers the window at once when the browser's full screen ${name}, and Esc or the button leaves`, () => {
      HTMLElement.prototype.requestFullscreen = request as never
      const { state, root, cover } = mount()
      act(() => {
        state.toggle()
      })
      expect(state.on).toBe(true)
      expect(cover()).toBe(true)
      esc()
      expect(state.on).toBe(false)
      expect(cover()).toBe(false)
      act(() => {
        state.toggle()
      })
      expect(cover()).toBe(true)
      act(() => {
        state.toggle()
      })
      expect(cover()).toBe(false)
      act(() => root.unmount())
    })
  }
})
