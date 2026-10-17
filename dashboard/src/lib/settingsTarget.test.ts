import { describe, expect, it } from 'vitest'
import { settingsTarget } from './settings'

describe('where a ?tab= opens', () => {
  it('a section that exists opens as named, and none opens General', () => {
    expect(settingsTarget('payments')).toEqual({ tab: 'payments' })
    expect(settingsTarget(null)).toEqual({ tab: 'site' })
  })
  it('an unknown one, such as the Modules tab that is gone, opens General at What the script records', () => {
    expect(settingsTarget('modules')).toEqual({ tab: 'site', extra: { focus: 'script-records' } })
    expect(settingsTarget('nonsense').tab).toBe('site')
  })
})
