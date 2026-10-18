import { describe, expect, it } from 'vitest'
import { TABS } from './sections'

describe('the Sources section', () => {
  it('has one UTM tab, not a second pair for source and medium', () => {
    expect(TABS.sources).toContain('utm')
    expect(TABS.sources).not.toContain('utmsource')
    expect(TABS.sources).not.toContain('medium')
  })
})
