import { describe, expect, it } from 'vitest'
import type { Table } from '../types'
import { tiles } from './Places'

const row = (val: string, v: number, code?: string) => ({ val, name: code === 'DE' ? 'Germany' : val, v, c: 0, st: '' as const, ...(code ? { code } : {}) })
const table = (rows: ReturnType<typeof row>[], of = 100): Table => ({ rows, of })

describe('the four numbers over the map', () => {
  it('counts the places and names the top country with its flag and share', () => {
    const t = tiles(table([row('DE', 60, 'DE'), row('FR', 40, 'FR')]), table([row('Bavaria', 30)]), table([row('Berlin', 20), row('Paris', 10), row('Lyon', 5)]))
    expect(t.map((k) => k.val)).toEqual(['2', '1', '3', 'Germany'])
    expect(t[3]).toMatchObject({ flag: 'DE', detail: '60% of people' })
  })
  it('says regions and cities are not recorded when people came and none was placed', () => {
    const t = tiles(table([row('DE', 10, 'DE')], 10), table([]), table([]))
    expect(t[1]).toMatchObject({ val: '–', detail: 'Not recorded on this site' })
    expect(t[2]).toMatchObject({ val: '–', detail: 'Not recorded on this site' })
  })
  it('says nothing was recorded, not "not recorded", when nobody came', () => {
    const t = tiles(table([], 0), table([]), table([]))
    expect(t[1].detail).toBe('None yet')
    expect(t[3]).toMatchObject({ val: '–', detail: 'None yet' })
  })
})
