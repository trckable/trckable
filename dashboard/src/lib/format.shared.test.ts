// The server writes the same figures in the emails and alerts (reports.Words,
// format_test.go is the other half). Both are held to one file of cases, so the
// same number reads the same in the app, the email and an alert.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fmtInt, fmtMoney, fmtDuration, fmtPct, move, times } from './format'

type Case<T> = T & { out: string }
const shared = JSON.parse(readFileSync(fileURLToPath(new URL('../../../server/internal/reports/testdata/format.json', import.meta.url)), 'utf8')) as {
  int: Case<{ in: number }>[]
  percent: Case<{ in: number }>[]
  move: { cur: number; prev: number; dir: string; pct: string }[]
  duration: Case<{ in: number }>[]
  times: Case<{ in: number }>[]
  money: Case<{ minor: number; currency: string; exponent: number }>[]
  moneyCents: Case<{ minor: number; currency: string; exponent: number }>[]
}

describe('the same figures as the server', () => {
  it('whole numbers', () => {
    for (const c of shared.int) expect(fmtInt(c.in)).toBe(c.out)
  })
  it('shares', () => {
    for (const c of shared.percent) expect(fmtPct(c.in)).toBe(c.out)
  })
  it('moves: the direction and the percentage', () => {
    for (const c of shared.move) expect(move(c.cur, c.prev)).toMatchObject({ dir: c.dir, pct: c.pct })
  })
  it('visit lengths', () => {
    for (const c of shared.duration) expect(fmtDuration(c.in)).toBe(c.out)
  })
  it('how many times', () => {
    for (const c of shared.times) expect(times(c.in)).toBe(c.out)
  })
  it('money, whole and with cents', () => {
    for (const c of shared.money) expect(fmtMoney(c.minor, c.currency, c.exponent, { cents: false })).toBe(c.out)
    for (const c of shared.moneyCents) expect(fmtMoney(c.minor, c.currency, c.exponent, { cents: true })).toBe(c.out)
  })
})
