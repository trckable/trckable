// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { PageHold, pageLoading } from './pageLoading'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('the page loading count', () => {
  it('counts the parts that are loading, and drops one when it goes', () => {
    const box = document.createElement('div')
    const root = createRoot(box)
    expect(pageLoading.get()).toBe(0)
    act(() => root.render(<><PageHold /><PageHold /></>))
    expect(pageLoading.get()).toBe(2)
    act(() => root.render(<PageHold />))
    expect(pageLoading.get()).toBe(1)
    act(() => root.unmount())
    expect(pageLoading.get()).toBe(0)
  })
})
