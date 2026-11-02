import { describe, expect, it } from 'vitest'
import { ALL_TABS, relatedTo, sectionOf } from './sections'

describe('where a section leads', () => {
  it('never to itself', () => {
    for (const t of ALL_TABS) expect(relatedTo(sectionOf(t))).not.toContain(sectionOf(t))
  })
})
