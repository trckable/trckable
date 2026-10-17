// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHART_KEY, keepChartMode, readChartMode } from './chartMode'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('chart mode', () => {
  it('starts as bars', () => expect(readChartMode()).toBe('bars'))
  it('remembers the line, and going back to bars', () => {
    keepChartMode('line')
    expect(readChartMode()).toBe('line')
    keepChartMode('bars')
    expect(readChartMode()).toBe('bars')
  })
  it('reads anything unknown as bars', () => {
    localStorage.setItem(CHART_KEY, 'pie')
    expect(readChartMode()).toBe('bars')
  })
  it('works without a store', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readChartMode()).toBe('bars')
    expect(() => keepChartMode('line')).not.toThrow()
  })
})
