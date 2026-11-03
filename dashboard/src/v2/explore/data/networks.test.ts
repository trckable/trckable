import { describe, expect, it } from 'vitest'
import type { Report, Row } from '../../../lib/api'
import { headline, mapNetworks, networkName } from './networks'
import type { NetworkRow } from '../types'

const row = (o: Partial<NetworkRow>): NetworkRow => ({ value: 'x', name: 'X', people: 40, rate: null, lcp: null, ...o })
const api = (value: string, visitors: number, o: Partial<Row> = {}): Row => ({ value, visitors, ...o })
const report = (network: Row[], extra: Record<string, unknown> = {}) => ({ current: { dims: { network }, ...extra } }) as unknown as Report

describe('networks', () => {
  it('says a provider without its legal ending', () => {
    expect(networkName('Deutsche Telekom AG')).toBe('Deutsche Telekom')
    expect(networkName('Reliance Jio Infocomm Limited')).toBe('Reliance Jio Infocomm')
    expect(networkName('Comcast Cable Communications, LLC')).toBe('Comcast Cable Communications')
    expect(networkName('Telefonica Germany GmbH & Co. OHG')).toBe('Telefonica Germany')
    expect(networkName('AS')).toBe('AS')
  })
  it('compares the lowest and highest converter', () => expect(headline([row({ name: 'Jio', rate: 0.009 }), row({ name: 'Vodafone', rate: 0.032 }), row({ name: 'Mid', rate: 0.02 })])).toBe('Visitors on Jio convert at 0.9%, on Vodafone at 3.2%.'))
  it('says stay, not convert, when it counts the visits that stayed', () => expect(headline([row({ name: 'Jio', rate: 0.4 }), row({ name: 'Vodafone', rate: 0.62 })], 'engaged')).toBe('Visitors on Jio stay at 40%, on Vodafone at 62%.'))
  it('claims nothing from one provider, equal rates or too few visits', () => {
    expect(headline([row({ rate: 0.1 })])).toContain('Too few')
    expect(headline([row({ rate: 0.1 }), row({ rate: 0.1 })])).toContain('Too few')
    expect(headline([row({ rate: null }), row({ rate: 0.2 })])).toContain('Too few')
  })
  it('counts sales when payments are connected, the goal otherwise, else the visits that stayed', () => {
    const sold = mapNetworks(report([api('A', 100, { customers: 5, revenue: 900, bounce_rate: 0.5 })], { money: {} }), null)
    expect(sold.basis).toBe('sales')
    expect(sold.rows[0].rate).toBeCloseTo(0.05)
    const goal = mapNetworks(report([api('A', 100, { signups: 8, bounce_rate: 0.5 })], { signup: { goal: 'signup', visitors: 8 } }), null)
    expect(goal.basis).toBe('goal')
    expect(goal.rows[0].rate).toBeCloseTo(0.08)
    const stayed = mapNetworks(report([api('A', 100, { bounce_rate: 0.25 })]), null)
    expect(stayed.basis).toBe('engaged')
    expect(stayed.rows[0].rate).toBeCloseTo(0.75)
  })
  it('shows no conversion under 30 visits, and a load time only from enough measured views', () => {
    const t = mapNetworks(report([api('A', 12, { bounce_rate: 0.5 }), api('B', 50, { bounce_rate: 0.5 })]), { samples: 9, good: 0, networks: [{ value: 'A', n: 3, lcp_ms: 4000 }, { value: 'B', n: 20, lcp_ms: 3100 }] })
    expect(t.rows.map((r) => [r.rate, r.lcp])).toEqual([[null, null], [0.5, 3100]])
  })
})
