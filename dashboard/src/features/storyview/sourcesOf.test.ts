import { describe, expect, it } from 'vitest'
import type { Result } from '../../lib/api'
import { sourcesOf } from './sourcesOf'

const res = (channel: [string, number][], country: [string, number][] = [], visitors = 10): Result =>
  ({ kpis: { visitors }, series: [], dims: { channel: channel.map(([value, v]) => ({ value, visitors: v })), country: country.map(([value, v]) => ({ value, visitors: v })) }, goals: null }) as unknown as Result

describe('sourcesOf', () => {
  it('names the top four and keeps every channel for the ring', () => {
    const s = sourcesOf(res([['Search', 4], ['Direct', 2], ['Social', 1], ['AI', 1], ['Email', 1], ['Referral', 1]]))
    expect(s?.all).toHaveLength(6)
    expect(s?.top.map((x) => x.value)).toEqual(['Search', 'Direct', 'Social', 'AI'])
    expect(s?.top[0].share).toBeCloseTo(0.4)
  })

  it('takes three countries as a share of all visitors', () => {
    const s = sourcesOf(res([['Direct', 10]], [['AL', 5], ['DE', 3], ['FR', 1], ['IT', 1]]))
    expect(s?.countries.map((x) => x.value)).toEqual(['AL', 'DE', 'FR'])
    expect(s?.countries[0].share).toBe(0.5)
  })

  it('has nothing without visitors', () => {
    expect(sourcesOf(res([]))).toBeUndefined()
    expect(sourcesOf(res([['Direct', 0]]))).toBeUndefined()
  })
})
