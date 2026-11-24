import { describe, expect, it } from 'vitest'
import { nameOf, reasonOf, split, versus, whyOf } from './standing'

describe('standing', () => {
  it('words why a goal stands out', () => {
    expect(reasonOf({ out: true, why: 'first' })).toBe('First time ever')
    expect(reasonOf({ out: true, why: 'times', factor: 5 })).toBe('5× a usual day')
    expect(reasonOf({ out: false })).toBe('')
  })

  it('says As usual. when nothing stands out, and what a usual day is when it does', () => {
    expect(whyOf({})).toBe('As usual.')
    expect(whyOf({ out: true, why: 'times', factor: 3, usual: 2 })).toBe('3× a usual day (a usual day is 2).')
    expect(whyOf({ out: true, why: 'times', factor: 3, usual: 2.5 })).toContain('2.5')
    expect(whyOf({ out: true, why: 'first' })).toMatch(/^First time ever/)
  })

  it('splits the goals that stand out from the usual ones, keeping the order', () => {
    const list = [{ g: 'a', out: false }, { g: 'b', out: true }, { g: 'c', out: false }, { g: 'd', out: true }]
    expect(split(list).out.map((g) => g.g)).toEqual(['b', 'd'])
    expect(split(list).usual.map((g) => g.g)).toEqual(['a', 'c'])
  })

  it('words the list column', () => {
    expect(versus({})).toBe('as usual')
    expect(versus({ out: true, why: 'first' })).toBe('New')
    expect(versus({ out: true, why: 'times', factor: 4 })).toBe('↑ 4×')
  })

  it('names a goal by its label as written, else its key in words, and a page goal by its own name', () => {
    expect(nameOf({ goal: 'start-free-1', name: 'Start free 1' })).toBe('Start free 1')
    expect(nameOf({ goal: 'signup_done', name: 'signup_done' })).toBe('Signup done')
    expect(nameOf({ goal: 'outbound_click' })).toBe('Outbound clicks')
    expect(nameOf({ goal: 'pg-run-123', name: 'pg-run-123', page: true })).toBe('pg-run-123')
  })
})
