import { describe, expect, it } from 'vitest'
import type { Filter } from './api'
import { filterParam, flipped, hasValue, MAX_VALUES, parseFilterParam, sameFilter, setsOf, withoutSet, withoutValue, withValue } from './filterSet'
import { readView, writeView } from './url'

describe('a filter in the address', () => {
  it('is dim:value for is, dim!:value for is not', () => {
    expect(filterParam({ dim: 'country', value: 'DE' })).toBe('country:DE')
    expect(filterParam({ dim: 'country', op: 'not', value: 'US' })).toBe('country!:US')
  })
  it('reads both forms back, and an old address as it always read', () => {
    expect(parseFilterParam('channel:Search')).toEqual({ dim: 'channel', value: 'Search' })
    expect(parseFilterParam('country!:US')).toEqual({ dim: 'country', op: 'not', value: 'US' })
    expect(parseFilterParam('page:/a:b!')).toEqual({ dim: 'page', value: '/a:b!' })
    for (const bad of ['country', ':DE', '!:DE', '']) expect(parseFilterParam(bad)).toBeNull()
  })
  it('round-trips through the whole view, in order', () => {
    const q = 'f=country%3ADE&f=country%3AAT&f=device%21%3AMobile&mode=full'
    const v = readView(new URLSearchParams(q))
    expect(v.filters).toEqual([
      { dim: 'country', value: 'DE' },
      { dim: 'country', value: 'AT' },
      { dim: 'device', op: 'not', value: 'Mobile' },
    ])
    expect(writeView(v)).toBe('?' + q)
  })
  it('keeps an address from before is not exactly as it was', () => {
    const q = 'period=7d&f=channel%3ASearch&f=country%3AUS'
    expect(writeView(readView(new URLSearchParams(q)))).toBe('?' + q)
  })
})

describe('sets', () => {
  const fs: Filter[] = [
    { dim: 'country', value: 'DE' },
    { dim: 'device', op: 'not', value: 'Mobile' },
    { dim: 'country', value: 'AT' },
    { dim: 'country', op: 'not', value: 'AT' },
  ]
  it('group the values of one dimension and op, in the order they first appear', () => {
    expect(setsOf(fs)).toEqual([
      { dim: 'country', op: 'is', values: ['DE', 'AT'] },
      { dim: 'device', op: 'not', values: ['Mobile'] },
      { dim: 'country', op: 'not', values: ['AT'] },
    ])
  })
  it('drop a repeated value', () => {
    expect(setsOf([{ dim: 'os', value: 'iOS' }, { dim: 'os', value: 'iOS' }])).toEqual([{ dim: 'os', op: 'is', values: ['iOS'] }])
  })
  it('compare by op as well as by value', () => {
    expect(sameFilter({ dim: 'a', value: 'x' }, { dim: 'a', op: 'not', value: 'x' })).toBe(false)
    expect(sameFilter({ dim: 'a', value: 'x' }, { dim: 'a', value: 'x' })).toBe(true)
  })
})

describe('picking from the Filter menu', () => {
  it('a second value of one dimension makes it any of', () => {
    const one = withValue([], 'country', 'DE')
    expect(withValue(one, 'country', 'AT')).toEqual([
      { dim: 'country', value: 'DE' },
      { dim: 'country', value: 'AT' },
    ])
  })
  it('joins an is-not set as an is-not value', () => {
    const f: Filter[] = [{ dim: 'country', op: 'not', value: 'US' }]
    expect(withValue(f, 'country', 'CA')).toEqual([...f, { dim: 'country', op: 'not', value: 'CA' }])
  })
  it('does nothing for a value already there, or past the limit', () => {
    const f: Filter[] = [{ dim: 'country', value: 'DE' }]
    expect(withValue(f, 'country', 'DE')).toBe(f)
    const full = Array.from({ length: MAX_VALUES }, (_, i): Filter => ({ dim: 'country', value: `X${i}` }))
    expect(withValue(full, 'country', 'DE')).toBe(full)
    expect(withValue(full, 'device', 'Mobile')).toHaveLength(MAX_VALUES + 1)
  })
  it('takes a value off whichever op it had', () => {
    const f: Filter[] = [{ dim: 'country', op: 'not', value: 'US' }, { dim: 'country', value: 'DE' }]
    expect(hasValue(f, 'country', 'US')).toBe(true)
    expect(withoutValue(f, 'country', 'US')).toEqual([{ dim: 'country', value: 'DE' }])
  })
})

describe('a chip', () => {
  const f: Filter[] = [{ dim: 'country', value: 'DE' }, { dim: 'country', value: 'AT' }, { dim: 'device', value: 'Mobile' }]
  it('turns is into is not for all its values, and nothing else', () => {
    const set = setsOf(f)[0]
    expect(flipped(f, set)).toEqual([
      { dim: 'country', op: 'not', value: 'DE' },
      { dim: 'country', op: 'not', value: 'AT' },
      { dim: 'device', value: 'Mobile' },
    ])
  })
  it('turns back to the plain form, so the address is the old one again', () => {
    const not = flipped(f, setsOf(f)[0])
    expect(flipped(not, setsOf(not)[0])).toEqual(f)
  })
  it('goes with its ×, values and all', () => {
    expect(withoutSet(f, setsOf(f)[0])).toEqual([{ dim: 'device', value: 'Mobile' }])
  })
})
