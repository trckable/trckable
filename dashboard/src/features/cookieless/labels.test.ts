import { describe, expect, it } from 'vitest'
import type { KPIs } from '../../lib/api'
import { journeysOn, newShare, newShareShort, newVsReturning } from './labels'

const k: KPIs = { visitors: 10, sessions: 12, pageviews: 30, bounce_rate: 0.4, avg_session_s: 60, views_per_session: 2.5, new_visitor_share: 0.7 }

describe('cookieless labels', () => {
  it('shows the numbers when the site has cookies', () => {
    expect(newShare(k, {})).toBe('70%')
    expect(newShare(undefined, {})).toBe('–')
    expect(newShareShort(k, { cookieless: false })).toBe(' · 70% new')
    expect(newVsReturning(k, {}).splits[0]).toMatchObject({ a: 7, b: 3 })
    expect(journeysOn({}, true)).toBe(true)
  })
  it('says Off, never a number, in cookieless mode', () => {
    const site = { cookieless: true }
    expect(newShare(k, site)).toBe('Off: cookieless mode')
    expect(newShareShort(k, site)).toBe('')
    expect(newVsReturning(k, site)).toEqual({ splits: [], rows: [{ label: 'New vs returning', value: 'Off: cookieless mode', faint: true }] })
    expect(journeysOn(site, true)).toBe(false)
    expect(journeysOn({}, undefined)).toBe(false)
  })
})
