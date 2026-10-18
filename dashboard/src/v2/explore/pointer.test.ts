// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clicks, rowWords } from './pointer'

const pointer = (fine: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: fine && q.includes('pointer: fine') }))

describe('the verb for pressing a row', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('is click with a mouse or trackpad', () => {
    pointer(true)
    expect(clicks()).toBe(true)
    expect(rowWords().filter).toBe('click a row to filter')
    expect(rowWords().page).toBe('Click a row to look at just that page.')
  })
  it('is tap on a touch screen', () => {
    pointer(false)
    expect(clicks()).toBe(false)
    expect(rowWords().source).toBe('Tap a row to look at just that source.')
  })
})
