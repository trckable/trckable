import { describe, expect, it } from 'vitest'
import type { Site } from './api'
import { tidyPath } from './landing'

const site = { id: 's1', domain: 'my.shop.co' } as Site

describe('a site address with a stray ending', () => {
  it('goes to the site itself', () => {
    expect(tidyPath(site, '/my.shop.co/nope')).toBe('/my.shop.co')
    expect(tidyPath(site, '/my.shop.co/')).toBe('/my.shop.co')
  })
  it('is left alone when there is none', () => {
    expect(tidyPath(site, '/my.shop.co')).toBeNull()
    expect(tidyPath(site, '/MY.shop.co')).toBeNull()
  })
})
