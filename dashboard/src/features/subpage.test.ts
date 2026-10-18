import { afterEach, describe, expect, it } from 'vitest'
import type { Site } from '../lib/api'
import { setRole } from '../lib/me'
import { routeOf } from './subpage'

const site = { id: 's', domain: 'a.example' } as Site

describe('the pages that hang off a site', () => {
  afterEach(() => setRole('owner', false))

  it('opens /mentions as its own page when Mentions is on', () => {
    setRole('owner', true)
    expect(routeOf([site], '/a.example/mentions')).toEqual({ site, sub: 'mentions' })
  })

  it('has no such page when Mentions is off: the address is not a page of the site', () => {
    setRole('owner', false)
    expect(routeOf([site], '/a.example/mentions').sub).toBeNull()
    expect(routeOf([site], '/a.example/incidents').sub).toBe('incidents')
  })
})
