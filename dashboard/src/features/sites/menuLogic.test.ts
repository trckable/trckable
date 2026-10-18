import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/api'
import { clashes, clashing, hasFinder, teamTotal } from './menuLogic'

const site = (id: string, domain: string, name = ''): Site => ({ id, domain, name, timezone: 'UTC', currency: 'USD', proxy_key: '' })

describe('the finder of the site menu', () => {
  it('is there from six sites', () => {
    expect(hasFinder(5, '')).toBe(false)
    expect(hasFinder(6, '')).toBe(true)
  })
  it('comes up on a short list as soon as something is typed', () => {
    expect(hasFinder(3, 'k')).toBe(true)
  })
})

describe('sites with the same name', () => {
  const sites = [site('a', 'blog.tash.al', 'Blog'), site('b', 'blog.albas.al', 'blog'), site('c', 'shop.example.com', 'Shop'), site('d', 'plain.example.com')]
  it('are found whatever the case, by name or by domain when there is none', () => {
    const twice = clashing(sites)
    expect(clashes(twice, sites[0])).toBe(true)
    expect(clashes(twice, sites[1])).toBe(true)
    expect(clashes(twice, sites[2])).toBe(false)
    expect(clashes(twice, sites[3])).toBe(false)
  })
  it('are none when every name is its own', () => {
    expect(clashing(sites.slice(2)).size).toBe(0)
  })
})

describe('the total beside All sites', () => {
  const numbers = new Map([
    ['a', { visitors: 12 }],
    ['b', { visitors: 30 }],
    ['other-team', { visitors: 500 }],
  ])
  it('adds only the sites of the team in view', () => {
    expect(teamTotal(numbers, [site('a', 'a.test'), site('b', 'b.test')])).toBe(42)
  })
  it('is nothing until the numbers are here, and 0 for a team with none', () => {
    expect(teamTotal(null, [site('a', 'a.test')])).toBeNull()
    expect(teamTotal(numbers, [site('zzz', 'z.test')])).toBe(0)
  })
})
