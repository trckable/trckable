// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { useLockScroll } from './lockScroll'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Lock() {
  useLockScroll()
  return null
}

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Lock />))
  return () => {
    act(() => root.unmount())
    host.remove()
  }
}

describe('useLockScroll', () => {
  it('holds the page while any lock is open and lets go with the last one', () => {
    const html = document.documentElement
    const a = mount()
    const b = mount()
    expect(html.style.overflow).toBe('hidden')
    a()
    expect(html.style.overflow).toBe('hidden')
    b()
    expect(html.style.overflow).toBe('')
  })
})
