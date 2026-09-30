import { describe, expect, it } from 'vitest'
import { digitIndex, stepFocus, typing } from './nav'

describe('the switcher keys', () => {
  it('steps down and up through the stops, and wraps at both ends', () => {
    expect(stepFocus(0, 4, 1)).toBe(1)
    expect(stepFocus(3, 4, 1)).toBe(0)
    expect(stepFocus(0, 4, -1)).toBe(3)
    expect(stepFocus(2, 4, -1)).toBe(1)
  })

  it('starts at the first stop going down and the last going up when focus is elsewhere', () => {
    expect(stepFocus(-1, 4, 1)).toBe(0)
    expect(stepFocus(-1, 4, -1)).toBe(3)
    expect(stepFocus(-1, 0, 1)).toBe(-1)
  })

  it('opens the site at a number key, and nothing for a key past the list or not 1–9', () => {
    expect(digitIndex('1', 3)).toBe(0)
    expect(digitIndex('3', 3)).toBe(2)
    expect(digitIndex('4', 3)).toBe(-1)
    expect(digitIndex('0', 9)).toBe(-1)
    expect(digitIndex('a', 9)).toBe(-1)
    expect(digitIndex('10', 9)).toBe(-1)
  })

  it('leaves a text field its digits', () => {
    expect(typing({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(typing({ tagName: 'BUTTON', isContentEditable: false } as unknown as EventTarget)).toBe(false)
    expect(typing(null)).toBe(false)
  })
})
