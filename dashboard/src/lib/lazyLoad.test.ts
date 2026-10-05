import { describe, expect, it, vi } from 'vitest'
import { lazyLoad, warm } from './lazyLoad'

describe('warm', () => {
  it('fetches the chunk once, on pointer, focus or touch, before any click', () => {
    const load = vi.fn(() => Promise.resolve({ default: () => null }))
    const { preload } = lazyLoad(load)
    const on = warm(preload)
    expect(load).not.toHaveBeenCalled()
    on.onPointerEnter()
    on.onFocus()
    on.onTouchStart()
    on.onPointerDown()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
