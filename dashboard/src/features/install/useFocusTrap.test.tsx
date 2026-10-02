// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Box({ also }: { also?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, also)
  return (
    <div ref={ref}>
      <button id="one">{'one'}</button>
      <button id="two">{'two'}</button>
    </div>
  )
}

let root: Root
let host: HTMLDivElement
const tab = (shift = false) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true })
  act(() => void document.activeElement?.dispatchEvent(e))
  return e.defaultPrevented
}
const at = () => document.activeElement?.id

describe('the focus trap', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    document.querySelector('.side-card')?.remove()
  })

  it('wraps from the last button to the first, and back', () => {
    act(() => root.render(<Box />))
    expect(at()).toBe('one')
    document.getElementById('two')?.focus()
    expect(tab()).toBe(true)
    expect(at()).toBe('one')
    expect(tab(true)).toBe(true)
    expect(at()).toBe('two')
  })

  it('lets Tab reach a side card after the box, and wraps from the card', () => {
    const card = document.createElement('aside')
    card.className = 'side-card'
    card.innerHTML = '<button id="x">x</button>'
    document.body.append(card)
    act(() => root.render(<Box also=".side-card" />))
    document.getElementById('two')?.focus()
    expect(tab()).toBe(false) // the browser moves on, to the card
    document.getElementById('x')?.focus()
    expect(tab()).toBe(true)
    expect(at()).toBe('one')
    expect(tab(true)).toBe(true)
    expect(at()).toBe('x')
  })
})
