import { describe, expect, it } from 'vitest'
import { SETTINGS_TABS } from '../../lib/settings'
import { ALL_TABS } from '../explore/sections'
import { SETUP_LINKS } from './setupLinks'

describe('Live setup links', () => {
  it('every link resolves to a known settings section or Explore table', () => {
    for (const [id, link] of Object.entries(SETUP_LINKS)) {
      const known = link.kind === 'settings' ? (SETTINGS_TABS as readonly string[]).includes(link.tab) : (ALL_TABS as string[]).includes(link.tab)
      expect(known, id).toBe(true)
    }
  })
})
