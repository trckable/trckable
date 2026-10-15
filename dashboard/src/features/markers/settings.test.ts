// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { setMarkers } from './settings'

describe('markers setting', () => {
  beforeEach(() => localStorage.clear())
  it('keeps the choice in this browser', () => {
    setMarkers(false)
    expect(localStorage.getItem('trckable:markers')).toBe('off')
    setMarkers(true)
    expect(localStorage.getItem('trckable:markers')).toBe('on')
  })
})
