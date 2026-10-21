import { describe, expect, it } from 'vitest'
import type { Site } from './api'
import { tidyPath } from './landing'
import { rememberMove } from './moved'
import { siteForSegment } from './siteRoute'

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

describe('a site whose domain was changed in this page', () => {
  const moved = { id: 's2', domain: 'new.shop.co' } as Site
  it('is still named by its old address, which is tidied to the new one', () => {
    expect(siteForSegment([moved], 'old.shop.co')).toBeNull()
    rememberMove('old.shop.co', 'new.shop.co')
    expect(siteForSegment([moved], 'Old.shop.co')).toBe(moved)
    expect(tidyPath(moved, '/old.shop.co')).toBe('/new.shop.co')
    expect(tidyPath(moved, '/new.shop.co')).toBeNull()
  })
})
