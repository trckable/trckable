import { describe, expect, it } from 'vitest'
import { tabsFor } from './accountTabs'

describe('the account window tabs', () => {
  it('gives an owner all four', () => {
    expect(tabsFor(false).map((t) => t.id)).toEqual(['sites', 'keys', 'people', 'profile'])
  })

  it('gives a viewer their own account and nothing that edits others', () => {
    expect(tabsFor(true).map((t) => t.id)).toEqual(['profile'])
  })
})
