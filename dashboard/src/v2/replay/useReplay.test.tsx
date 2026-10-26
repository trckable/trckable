// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReplay, type Replay } from './useReplay'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
let r: Replay

function Probe() {
  r = useReplay('k')
  return null
}
const key = (k: string) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })))

describe('the replay cinema state', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<Probe />))
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })
  /** Begun, and its moments read: one at 40% of the line. */
  const begin = () => {
    act(() => r.start())
    act(() => r.ready([0.4]))
  }

  it('is off, opens on start, and closes on stop', () => {
    expect(r.phase).toBe('off')
    begin()
    expect(r.phase).toBe('on')
    expect(r.playing).toBe(true)
    act(() => r.stop())
    expect(r.phase).toBe('off')
  })
  it('pauses and goes on', () => {
    begin()
    act(() => r.toggle())
    expect(r.paused).toBe(true)
    act(() => r.toggle())
    expect(r.paused).toBe(false)
  })
  it('skips to the next moment, then to the end state, and again plays from the start', () => {
    begin()
    act(() => void r.next())
    expect(r.phase).toBe('on')
    act(() => void r.next())
    expect(r.phase).toBe('end')
    expect(r.playing).toBe(false)
    act(() => r.start())
    expect(r.phase).toBe('on')
  })
  it('answers the keys: Space pauses, the right arrow skips, Esc closes', () => {
    begin()
    key(' ')
    expect(r.paused).toBe(true)
    key(' ')
    expect(r.paused).toBe(false)
    key('ArrowRight')
    key('ArrowRight')
    expect(r.phase).toBe('end')
    key('Escape')
    expect(r.phase).toBe('off')
  })
  it('leaves Space to a focused button', () => {
    begin()
    const b = document.createElement('button')
    host.append(b)
    act(() => void b.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })))
    expect(r.paused).toBe(false)
  })
})
