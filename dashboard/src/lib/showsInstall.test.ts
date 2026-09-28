import { describe, expect, it } from 'vitest'
import { showsInstall } from './api'

const base = { hasData: false, filtered: false, everTracked: null }

describe('showsInstall', () => {
  it('shows at once for a site that never had a visit', () => {
    expect(showsInstall({ ...base, site: { last_event_at: 0 } })).toBe(true)
  })
  it('waits for the events check on a site that had visits', () => {
    expect(showsInstall({ ...base, site: { last_event_at: 1 } })).toBe(false)
    expect(showsInstall({ ...base, site: { last_event_at: 1 }, everTracked: false })).toBe(true)
  })
  it('never hides real numbers or a filtered view', () => {
    expect(showsInstall({ ...base, site: { last_event_at: 0 }, hasData: true })).toBe(false)
    expect(showsInstall({ ...base, site: { last_event_at: 0 }, filtered: true })).toBe(false)
  })
})
