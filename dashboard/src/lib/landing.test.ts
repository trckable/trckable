import { describe, expect, it } from 'vitest'
import type { Site } from './api'
import { landing } from './landing'

const sites = [
  { id: 's1', domain: 'one.com' },
  { id: 's2', domain: 'two.com' },
] as Site[]

describe('landing', () => {
  it('opens the site a link asked for, and drops ?site', () => {
    expect(landing(sites, new URLSearchParams('site=s2&period=7d')))
      .toEqual({ path: '/two.com?period=7d', wizard: false })
  })

  it('opens the first site for an unknown or missing id', () => {
    expect(landing(sites, new URLSearchParams('site=nope')).path).toBe('/one.com')
    expect(landing(sites, new URLSearchParams('')).path).toBe('/one.com')
  })

  it('keeps the rest of a link, such as ?add=site or ?account=keys', () => {
    expect(landing(sites, new URLSearchParams('add=site')).path).toBe('/one.com?add=site')
  })

  it('has no site: the first run over the settings page, on every server', () => {
    expect(landing([], new URLSearchParams(''))).toEqual({ path: '/', wizard: true })
  })
})
