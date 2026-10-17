import { describe, expect, it } from 'vitest'
import { chipName, keyOf, nameOf, toggled, valueOf, withValue, without } from './filters'
import type { FilterDim, Option } from './types'

const options: Partial<Record<FilterDim, Option[]>> = {
  referrer: [{ val: 'news.ycombinator.com', name: 'Hacker News', short: 'HN' }],
  device: [{ val: 'Mobile', name: 'Mobile' }],
}

describe('filters', () => {
  it('turns a value on, and off again when it is the one that is on', () => {
    const on = toggled([], 'device', 'Mobile')
    expect(on).toEqual([{ dim: 'device', value: 'Mobile' }])
    expect(toggled(on, 'device', 'Mobile')).toEqual([])
  })
  it('keeps one value to a dimension', () => {
    expect(toggled([{ dim: 'device', value: 'Mobile' }], 'device', 'Desktop')).toEqual([{ dim: 'device', value: 'Desktop' }])
    expect(withValue([{ dim: 'device', value: 'Mobile' }], 'page', '/')).toHaveLength(2)
  })
  it('takes one dimension off', () => {
    expect(without([{ dim: 'device', value: 'Mobile' }, { dim: 'page', value: '/' }], 'device')).toEqual([{ dim: 'page', value: '/' }])
  })
  it('reads the value of a dimension', () => {
    expect(valueOf([{ dim: 'page', value: '/pricing' }], 'page')).toBe('/pricing')
    expect(valueOf([], 'page')).toBeNull()
    expect(valueOf([{ dim: 'page', value: '/' }], undefined)).toBeNull()
  })
  it('names a chip with the short name, the name, or the country as people say it', () => {
    expect(chipName({ dim: 'referrer', value: 'news.ycombinator.com' }, options)).toBe('HN')
    expect(chipName({ dim: 'device', value: 'Mobile' }, options)).toBe('Mobile')
    expect(chipName({ dim: 'country', value: 'DE' }, options)).toBe('Germany')
    expect(nameOf([{ dim: 'device', value: 'Mobile' }, { dim: 'referrer', value: 'news.ycombinator.com' }], options)).toBe('Mobile · HN')
  })
  it('gives the same key for the same filters in any order', () => {
    const a = keyOf([{ dim: 'page', value: '/' }, { dim: 'device', value: 'Mobile' }])
    expect(a).toBe(keyOf([{ dim: 'device', value: 'Mobile' }, { dim: 'page', value: '/' }]))
    expect(a).toBe('device=Mobile&page=/')
  })
})
