import { describe, expect, it } from 'vitest'
import type { Milestone } from '../../lib/api'
import { badge, byYear, hasDot, leftLine, lineOf, nearest, newest, nextLine, ringPct, say, tileLabel } from './words'

const m = (o: Partial<Milestone>): Milestone => ({ kind: 'visitors', step: '1000', value: 1000, day: '2026-09-21', created_at: 0, new: false, shared: false, ...o })

describe('milestone words', () => {
  it('says each family its own way', () => {
    expect(say(m({}))).toEqual({ big: '1,000', n: 1000, label: 'visitors', money: false })
    expect(say(m({ kind: 'first_sale', value: 1 }))).toEqual({ big: '', n: 0, label: 'First sale', money: true })
    expect(say(m({ kind: 'pageviews', value: 1 })).label).toBe('First pageview')
    expect(say(m({ kind: 'revenue', value: 1000, currency: 'USD' })).big).toBe('$1,000')
    expect(say(m({ kind: 'record_day', value: 412 })).label).toBe('visitors · record day')
  })
  it('writes the next step with numbers only', () => {
    expect(nextLine({ kind: 'visitors', step: 10000, now: 7412 })).toBe('next 10,000 visitors · 7,412 now')
  })
  it('groups the timeline by year, newest first', () => {
    const g = byYear([m({ day: '2026-09-21' }), m({ day: '2026-01-02' }), m({ day: '2025-12-04' })])
    expect(g.map((y) => [y.year, y.items.length])).toEqual([['2026', 2], ['2025', 1]])
  })
  it('dots the menu for what arrived since it was opened, not the moment on screen', () => {
    const a = m({ created_at: 200 })
    const b = m({ kind: 'countries', step: '10', created_at: 300 })
    expect(hasDot([a, b], 100, b)).toBe(true)
    expect(hasDot([a, b], 250, b)).toBe(false)
    expect(hasDot([a], 300, null)).toBe(false)
  })
  it('picks the newest reached: latest day, then latest stored', () => {
    const a = m({ day: '2026-09-21', created_at: 5 })
    const b = m({ kind: 'countries', step: '10', day: '2026-09-28', created_at: 1 })
    const c = m({ kind: 'pageviews', step: '100', day: '2026-09-28', created_at: 9 })
    expect(newest([a, b, c])).toBe(c)
    expect(newest([])).toBeNull()
  })
  it('writes the ring as a whole percent and what is left', () => {
    expect(ringPct({ step: 1000, now: 453.7 })).toBe(45)
    expect(ringPct({ step: 1000, now: 0 })).toBe(0)
    expect(ringPct({ step: 1000, now: 999.9 })).toBe(99)
    expect(leftLine({ kind: 'visitors', step: 1000, now: 453 })).toBe('547 to go')
    expect(leftLine({ kind: 'revenue', step: 100, now: 0, currency: 'USD' })).toBe('no sale yet')
    expect(leftLine({ kind: 'revenue', step: 100, now: 40, currency: 'USD' })).toBe('$60 to go')
    expect(nearest([{ kind: 'visitors', step: 1000, now: 100 }, { kind: 'countries', step: 25, now: 14 }])?.kind).toBe('countries')
  })
  it('shows revenue amounts where the report shows revenue, hides them where it does not', () => {
    const r = m({ kind: 'revenue', step: '1000', value: 1000, currency: 'USD' })
    expect(badge(r, false)).toBe('')
    expect(tileLabel(r, false)).toBe('Revenue milestone')
    expect(lineOf(r, false)).not.toContain('$')
    expect(badge(r, true)).toBe('$1,000')
    expect(tileLabel(r, true)).toBe('$1,000 revenue')
    expect(lineOf(r, true)).toContain('$1,000')
    expect(badge(m({ kind: 'first_sale', value: 1 }), true)).toBe('1st')
  })
})
