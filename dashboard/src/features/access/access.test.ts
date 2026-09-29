import { describe, expect, it } from 'vitest'
import { summary } from './AccessTag'
import { changed } from './draft'

describe('the allowed sites summary on a row', () => {
  it('says All sites for no limit', () => expect(summary(null, 8)).toBe('All sites'))
  it('says how many of the sites', () => expect(summary(['a', 'b', 'c', 'd'], 8)).toBe('4 of 8'))
  it('says No sites for an empty list', () => expect(summary([], 8)).toBe('No sites'))
})

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
