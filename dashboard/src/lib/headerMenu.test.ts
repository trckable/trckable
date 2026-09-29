import { describe, expect, it } from 'vitest'
import { nextItem } from './headerMenu'

describe('arrow keys in a header menu', () => {
  it('goes down and wraps to the top', () => {
    expect(nextItem('ArrowDown', 0, 3)).toBe(1)
    expect(nextItem('ArrowDown', 2, 3)).toBe(0)
  })
  it('goes up and wraps to the bottom', () => {
    expect(nextItem('ArrowUp', 1, 3)).toBe(0)
    expect(nextItem('ArrowUp', 0, 3)).toBe(2)
  })
  it('starts at the top going down and at the bottom going up', () => {
    expect(nextItem('ArrowDown', -1, 3)).toBe(0)
    expect(nextItem('ArrowUp', -1, 3)).toBe(2)
  })
  it('jumps with Home and End', () => {
    expect(nextItem('Home', 2, 4)).toBe(0)
    expect(nextItem('End', 0, 4)).toBe(3)
  })
  it('ignores other keys and empty menus', () => {
    expect(nextItem('a', 0, 3)).toBeNull()
    expect(nextItem('ArrowDown', -1, 0)).toBeNull()
  })
})
