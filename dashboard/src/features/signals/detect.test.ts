import { describe, expect, it } from 'vitest'
import { gained, silentHours, SPIKE_FLOOR, Usual } from './detect'
import { baseTitle, dotted, tabTitle } from './tabTitle'

describe('the tab title', () => {
  it('starts with a dot and the count while anyone is online', () => {
    expect(tabTitle('trckable', 8, true)).toBe('● 8 · trckable')
    expect(tabTitle('trckable', 1, true)).toBe('● 1 · trckable')
  })
  it('is the plain title at 0, with no count yet, or when it is off', () => {
    expect(tabTitle('trckable', 0, true)).toBe('trckable')
    expect(tabTitle('trckable', null, true)).toBe('trckable')
    expect(tabTitle('trckable', undefined, true)).toBe('trckable')
    expect(tabTitle('trckable', 8, false)).toBe('trckable')
  })
  it('takes a count off before it puts the next on', () => {
    expect(baseTitle('● 12 · trckable')).toBe('trckable')
    expect(baseTitle('trckable')).toBe('trckable')
    expect(tabTitle(baseTitle('● 12 · trckable'), 3, true)).toBe('● 3 · trckable')
  })
  it('puts one dot on the icon', () => {
    const svg = dotted('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0 0"/></svg>')
    expect(svg.match(/<circle/g)).toHaveLength(1)
    expect(svg.endsWith('</svg>')).toBe(true)
  })
})

describe('a first sale from a new source', () => {
  it('names the sources that were not there before', () => {
    expect(gained(['Search', 'Direct'], ['Search', 'Direct', 'Email'])).toEqual(['Email'])
    expect(gained(['Search'], ['Search'])).toEqual([])
  })
  it('says nothing on the first look: there is nothing to compare with', () => {
    expect(gained(null, ['Search', 'Direct'])).toEqual([])
  })
  it('does not call a source that went away a new one', () => {
    expect(gained(['Search', 'Email'], ['Search'])).toEqual([])
  })
})

describe('a spike', () => {
  const warmed = (n: number, ...more: number[]) => {
    const u = new Usual()
    for (let i = 0; i < n; i++) u.add(2)
    more.forEach((m) => u.add(m))
    return u
  }
  it('is three times what this tab has seen, and not before it has seen enough', () => {
    const u = new Usual()
    for (let i = 0; i < 5; i++) expect(u.add(2)).toBe(false)
    expect(u.add(30)).toBe(false) // six samples are needed first
    expect(warmed(6).add(6)).toBe(true) // 3 × 2
    expect(warmed(6).add(5)).toBe(false) // under three times
  })
  it('needs a few people, not just a big ratio', () => {
    const u = warmed(8)
    expect(u.add(SPIKE_FLOOR - 1)).toBe(false)
    const quiet = new Usual()
    for (let i = 0; i < 8; i++) quiet.add(0)
    expect(quiet.add(SPIKE_FLOOR)).toBe(true) // from nobody to five is a spike
    expect(quiet.add(SPIKE_FLOOR - 1)).toBe(false)
  })
  it('keeps a spike out of what is usual, so a long one keeps being one', () => {
    const u = warmed(8)
    expect(u.add(20)).toBe(true)
    expect(u.add(20)).toBe(true)
    expect(u.add(20)).toBe(true)
    expect(u.add(2)).toBe(false)
  })
})

describe('tracking stopped', () => {
  const h = 3_600_000
  it('is six hours without a visit, counted in whole hours', () => {
    expect(silentHours(0, 10 * h)).toBe(0)
    expect(silentHours(undefined, 10 * h)).toBe(0)
    expect(silentHours(1000, 1000 + 5.9 * h)).toBe(0)
    expect(silentHours(1000, 1000 + 6 * h)).toBe(6)
    expect(silentHours(1000, 1000 + 9.5 * h)).toBe(9)
  })
})
