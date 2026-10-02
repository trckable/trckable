import { describe, expect, it } from 'vitest'
import { times } from './times'

describe('times', () => {
  it('one decimal under ten, none from ten on, never a trailing zero', () => {
    expect(times(2.44)).toBe('2.4×')
    expect(times(3)).toBe('3×')
    expect(times(3.04)).toBe('3×')
    expect(times(9.96)).toBe('10×')
    expect(times(12.4)).toBe('12×')
    expect(times(17.2)).toBe('17×')
    expect(times(230.03)).toBe('230×')
  })
})
