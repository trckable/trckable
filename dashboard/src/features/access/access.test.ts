import { describe, expect, it } from 'vitest'
import { changed } from './draft'

describe('whether the popup has something to save', () => {
  it('is quiet when nothing moved', () => {
    expect(changed(null, null)).toBe(false)
    expect(changed(['a', 'b'], ['b', 'a'])).toBe(false)
  })
  it('notices a switch between All sites and some', () => {
    expect(changed(null, [])).toBe(true)
    expect(changed(['a'], null)).toBe(true)
  })
  it('notices a site added or swapped', () => {
    expect(changed(['a'], ['a', 'b'])).toBe(true)
    expect(changed(['a', 'b'], ['a', 'c'])).toBe(true)
  })
})
