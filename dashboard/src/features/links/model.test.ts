import { describe, expect, it } from 'vitest'
import { barPct, bestLinks, filterOf, isLocalName, sampleLink, sinceLast, timesUsual } from './model'

describe('barPct', () => {
  it('is the share of the busiest row, with a floor so a small one still shows', () => {
    expect(barPct(50, 100)).toBe(50)
    expect(barPct(100, 100)).toBe(100)
    expect(barPct(1, 1000)).toBe(3)
    expect(barPct(0, 100)).toBe(0)
    expect(barPct(5, 0)).toBe(0)
  })
})

describe('filterOf', () => {
  it('is the link filter on the row\'s key, so a tap shows what the row counted', () => {
    expect(filterOf({ key: 'trustmrr' })).toEqual({ dim: 'link', value: 'trustmrr' })
    expect(filterOf({ key: 'newsletter' })).toEqual({ dim: 'link', value: 'newsletter' })
  })
})

describe('sinceLast', () => {
  it('says now for a moment ago and counts hours and days beyond', () => {
    expect(sinceLast(1000, 1010)).toMatch(/now/i)
    expect(sinceLast(1000, 1000 + 2 * 3600)).toMatch(/2/)
    expect(sinceLast(1000, 1000 + 3 * 86400)).toMatch(/3/)
  })
})

describe('sampleLink', () => {
  it('is the site with a tag', () => {
    expect(sampleLink('example.com')).toBe('example.com/?ref=newsletter')
  })
})

describe('isLocalName', () => {
  it('knows the names of the machine itself', () => {
    for (const v of ['localhost', 'LOCALHOST', '127.0.0.1', '127.3.4.5', '::1', '[::1]', 'app.local', 'web.localhost', 'shop.test']) expect(isLocalName(v)).toBe(true)
    for (const v of ['producthunt.com', 'newsletter', 'local.dev', 'latest.io', '127.example.com']) expect(isLocalName(v)).toBe(false)
  })
})

describe('bestLinks', () => {
  const row = (value: string, visitors: number, goals = 0) => ({ value, visitors, goals })
  it('is none while no link has enough visitors or a goal', () => {
    expect(bestLinks([row('a', 19), row('b', 3)], false)).toBeNull()
    expect(bestLinks([], true)).toBeNull()
  })
  it('names the link with the most visitors, and the next one', () => {
    const got = bestLinks([row('b', 40), row('a', 120), row('c', 5)], false)
    expect(got?.best.value).toBe('a')
    expect(got?.runner?.value).toBe('b')
  })
  it('prefers goals when the site counts them, and a goal needs no crowd', () => {
    expect(bestLinks([row('a', 120), row('b', 4, 1)], true)?.best.value).toBe('b')
    expect(bestLinks([row('a', 120, 6), row('b', 40)], true)?.best.value).toBe('a')
  })
  it('never counts a local address', () => {
    expect(bestLinks([row('localhost', 500, 9), row('127.0.0.1', 300), row('a', 10)], false)).toBeNull()
    expect(bestLinks([row('localhost', 500, 9), row('a', 30)], false)?.best.value).toBe('a')
  })
})

describe('timesUsual', () => {
  it('is a whole number of times when clearly above the usual', () => {
    expect(timesUsual({ visitors: 120, goals: 6 }, 0.025)).toBe(2)
    expect(timesUsual({ visitors: 120, goals: 6 }, 0.045)).toBeUndefined()
    expect(timesUsual({ visitors: 120, goals: 0 }, 0.025)).toBeUndefined()
    expect(timesUsual({ visitors: 120, goals: 6 }, undefined)).toBeUndefined()
  })
})

describe('bestLinks with a ref and a utm_source of one name', () => {
  it('reads the folded row (both spellings counted in it) as one link, never a runner-up of itself', () => {
    const merged = { value: 'newsletter', visitors: 30, goals: 0 } // ?ref=newsletter 20 + ?utm_source=newsletter 10, one row from the server
    const r = bestLinks([merged, { value: 'friend', visitors: 5, goals: 0 }], false)
    expect(r?.best.value).toBe('newsletter')
    expect(r?.best.visitors).toBe(30)
    expect(r?.runner?.value).toBe('friend')
  })
})
