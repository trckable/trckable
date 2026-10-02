import { describe, expect, it } from 'vitest'
import { figureOf, seeLabel, showing, whenOf } from './figure'
import { fmtInt } from '../../lib/format'
import type { Pin } from './pins'

const money = (m: number) => `$${(m / 100).toFixed(2)}`
const pin = (o: Partial<Pin>): Pin => ({ id: 'x', kind: 'spike', score: 1, filters: [], showDay: false, n: {}, ...o })

describe('a pin as a card tells it', () => {
  it('counts a spike up in visitors, with how many times the usual', () => {
    expect(figureOf(pin({ kind: 'spike', n: { visitors: 2813, factor: 17.2 } }), money)).toMatchObject({ n: 2813, unit: 'visitors', mult: '17×' })
    // A spike on a quiet site has no usual to multiply: the count, no multiplier.
    expect(figureOf(pin({ kind: 'spike', n: { visitors: 230 } }), money)).toEqual({ n: 230, fmt: fmtInt, unit: 'visitors' })
    // A spike without a count is only its factor.
    expect(figureOf(pin({ kind: 'spike', n: { factor: 4 } }), money)).toEqual({ text: '4×' })
  })

  it('counts a sale up in money, and writes a drop as the rate it fell from and to', () => {
    const sale = figureOf(pin({ kind: 'sale', n: { amount: 4900 } }), money)
    expect(sale.text).toBe('$49.00')
    expect(sale.fmt?.(2450)).toBe('$24.50')
    expect(figureOf(pin({ kind: 'drop', n: { wasRate: 0.05, rate: 0.03 } }), money)).toMatchObject({ text: '5.0% → 3.0%', unit: 'buying' })
  })

  it('writes a move signed, a milestone as its number and its label, and the rest in words', () => {
    expect(figureOf(pin({ kind: 'move', n: { change: 0.5 } }), money).text).toBe('+50%')
    expect(figureOf(pin({ kind: 'move', n: { change: -0.2 } }), money).text).toBe('−20%')
    const m = figureOf(pin({ kind: 'milestone', n: { family: 'visitors', value: 10000 } }), money)
    expect(m).toMatchObject({ n: 10000, text: '10,000', unit: 'visitors' })
    expect(m.fmt?.(1234)).toBe('1,234')
    expect(figureOf(pin({ kind: 'ai', n: { name: 'ChatGPT' } }), money).text).toBe('ChatGPT')
  })

  it('says when in words, and the date for a tooltip', () => {
    expect(whenOf(pin({ day: '2026-10-02' }), '2026-10-02')).toEqual({ text: 'today', title: 'Fri, Oct 2' })
    expect(whenOf(pin({ day: '2026-10-01' }), '2026-10-02')?.text).toBe('yesterday')
    expect(whenOf(pin({ day: '2026-09-27' }), '2026-10-02')).toEqual({ text: '5 days ago', title: 'Sun, Sep 27' })
    expect(whenOf(pin({}), '2026-10-02')).toBeUndefined()
  })

  it('labels the action in two or three words: the day it shows, or what it filters', () => {
    expect(seeLabel(pin({ showDay: true, day: '2026-09-28' }))).toBe('Show Sep 28')
    expect(seeLabel(pin({ filters: [{ dim: 'referrer', value: 'google.com' }] }))).toBe('Filter source')
    expect(seeLabel(pin({ filters: [{ dim: 'entry_page', value: '/pricing' }] }))).toBe('Filter page')
    expect(seeLabel(pin({ filters: [{ dim: 'channel', value: 'AI' }] }))).toBe('Filter AI')
    expect(seeLabel(pin({ filters: [{ dim: 'channel', value: 'Search' }] }))).toBe('Filter source')
  })

  it('says what is on screen after the click: the filter and the day', () => {
    expect(showing(pin({ kind: 'referrer', day: '2026-09-27', filters: [{ dim: 'referrer', value: 'google.com' }] }))).toBe('Showing google.com · Sep 27')
    expect(showing(pin({ filters: [{ dim: 'entry_page', value: '/pricing' }] }))).toBe('Showing /pricing')
    expect(showing(pin({ day: '2026-09-28' }))).toBe('Showing Sep 28')
  })
})
