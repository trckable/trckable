// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSheet } from './useSheet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Sheet({ name, onClose }: { name: string; onClose: () => void }) {
  const box = useRef<HTMLElement>(null)
  useSheet(box, onClose)
  return <aside ref={box} tabIndex={-1}>{name}</aside>
}

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

describe('a sheet over the Briefing', () => {
  it('closes the sheet that was open when another one opens, and not itself', () => {
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()
    act(() => root.render(<Sheet name="a" onClose={first} />))
    expect(first).not.toHaveBeenCalled()
    act(() => root.render(<><Sheet name="a" onClose={first} /><Sheet name="b" onClose={second} /></>))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('closes on Escape, and takes focus when it opens', () => {
    const close = vi.fn<() => void>()
    act(() => root.render(<Sheet name="a" onClose={close} />))
    expect(document.activeElement?.tagName).toBe('ASIDE')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not close again when it only redraws with a new handler', () => {
    const close = vi.fn<() => void>()
    act(() => root.render(<Sheet name="a" onClose={() => close()} />))
    act(() => root.render(<Sheet name="a" onClose={() => close()} />))
    expect(close).not.toHaveBeenCalled()
  })
})
