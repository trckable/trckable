import { describe, expect, it } from 'vitest'
import type { Pin } from './pins'
import { say } from './words'

const usd = (n: number) => `$${(n / 100).toLocaleString('en-US')}`
const pin = (kind: Pin['kind'], over: Partial<Pin>): Pin => ({ id: kind, kind, score: 1, filters: [], showDay: false, n: {}, ...over })

describe('what a pin says', () => {
  it('a spike: the line the rings said, the figure and who sent it', () => {
    const s = say(pin('spike', { day: '2026-09-19', n: { factor: 4.2, visitors: 816, referrer: 'news.example' } }), usd)
    expect(s.line).toBe('Spike · 4.2× the usual · mostly from news.example')
    expect(s.big).toBe('816 visitors')
    expect(s.facts).toEqual(['4.2× the usual', 'mostly from news.example', 'Sat, Sep 19'])
  })

  it('sales: the amount, how many and who earned most', () => {
    const s = say(pin('sale', { day: '2026-09-02', n: { count: 3, amount: 132200, channel: 'AI' } }), usd)
    expect(s.line).toBe('3 sales · $1,322 · mostly AI assistants')
    expect(s.big).toBe('$1,322')
  })

  it('a page that lost buyers: the two rates, the page and since when', () => {
    const s = say(pin('drop', { day: '2026-09-12', filters: [{ dim: 'entry_page', value: '/pricing' }], n: { name: '/pricing', visitors: 1204, rate: 0.031, wasRate: 0.051 } }), usd)
    expect(s.line).toBe('/pricing converts 3.1%, was 5.1%')
    expect(s.big).toBe('5.1% → 3.1%')
    expect(s.facts).toEqual(['/pricing', '1,204 visitors', 'since Sep 12'])
  })

  it('a new referrer and the day it first sent anyone', () => {
    const s = say(pin('referrer', { day: '2026-09-13', filters: [{ dim: 'referrer', value: 'linkedin.com' }], n: { name: 'linkedin.com', visitors: 463 } }), usd)
    expect(s.line).toBe('New referrer: linkedin.com sent 463 visitors')
    expect(s.facts).toContain('first seen Sep 13')
  })

  it('a channel is called by its own name', () => {
    const s = say(pin('move', { filters: [{ dim: 'channel', value: 'AI' }], n: { name: 'AI', visitors: 900, was: 600, change: 0.5 } }), usd)
    expect(s.line).toBe('AI assistants up 50% · 600 → 900 visitors')
    expect(s.big).toBe('+50%')
  })

  it('a milestone reads as the milestones do', () => {
    const s = say(pin('milestone', { day: '2026-09-05', n: { family: 'visitors', value: 10000 } }), usd)
    expect(s.line).toBe('Milestone · 10,000 visitors')
  })
})
