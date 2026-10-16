import { describe, expect, it } from 'vitest'
import type { Row } from '../../../lib/api'
import { noteOf, rowsOf, statOf } from './stats'

const r = (value: string, visitors: number): Row => ({ value, visitors })

describe('statOf', () => {
  it('puts a number inside a quarter either way of the one before as usual', () => {
    expect(statOf(110, 100)).toMatchObject({ lo: 75, hi: 126, st: '' })
  })
  it('says above and below when it is outside that range', () => {
    expect(statOf(200, 100).st).toBe('up')
    expect(statOf(40, 100).st).toBe('dn')
  })
  it('says nothing without a base worth measuring against', () => {
    expect(statOf(200, 100, false).st).toBe('')
  })
  it('says nothing about a handful of people', () => {
    expect(statOf(3, 1).st).toBe('')
  })
})

describe('rowsOf', () => {
  const name = (v: string) => v.toUpperCase()
  it('lines each row up against the same row of the period before, biggest first', () => {
    const rows = rowsOf([r('/a', 50), r('/b', 200)], [r('/a', 50), r('/b', 40)], 90, name)
    expect(rows.map((x) => [x.name, x.v, x.c, x.st])).toEqual([
      ['/B', 200, 40, 'up'],
      ['/A', 50, 50, ''],
    ])
  })
  it('keeps a row that was there before and is gone now, at nothing', () => {
    const rows = rowsOf([r('/a', 50)], [r('/a', 50), r('/gone', 30)], 80, name)
    expect(rows.find((x) => x.val === '/gone')).toMatchObject({ v: 0, c: 30, st: 'dn' })
  })
  it('does not judge rows when the period before was too thin to be a base', () => {
    const rows = rowsOf([r('/a', 50)], [r('/a', 2)], 4, name)
    expect(rows[0].st).toBe('')
  })
  it('drops rows nobody visited and carries what the caller adds', () => {
    const rows = rowsOf([r('de', 9), r('xx', 0)], undefined, undefined, name, (v) => ({ code: v }))
    expect(rows).toEqual([{ val: 'de', name: 'DE', v: 9, c: 0, st: '', code: 'de' }])
  })
})

describe('noteOf', () => {
  it('says how far from usual a number is', () => {
    expect(noteOf(statOf(200, 100), 'vs usual', 'as usual', '')).toEqual({ c: 'up', t: '+100% vs usual' })
    expect(noteOf(statOf(40, 100), 'vs usual', 'as usual', '')).toEqual({ c: 'dn', t: '−60% vs usual' })
  })
  it('says as usual inside the range, and nothing with nothing to compare', () => {
    expect(noteOf(statOf(100, 100), 'vs usual', 'as usual', '').t).toBe('as usual')
    expect(noteOf(statOf(100, undefined), 'vs usual', 'as usual', '').t).toBe('')
  })
})
