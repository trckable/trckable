import { describe, expect, it } from 'vitest'
import { exportQuery, queryOf, rangeOf, showsChange } from './dashQuery'
import { readView, writeView } from './url'

const view = (qs: string) => readView(new URLSearchParams(qs))

describe('no comparison', () => {
  it('shows no change figure anywhere, and a comparison of any kind shows them', () => {
    expect(showsChange(view('period=7d&compare=none'))).toBe(false)
    expect(showsChange(view('period=custom&from=2026-09-20&to=2026-09-26'))).toBe(false)
    for (const mode of ['previous', 'year', 'custom']) expect(showsChange(view(`period=7d&compare=${mode}`))).toBe(true)
  })

  it('compares a preset period with the one before unless told not to', () => {
    for (const p of ['', 'period=yesterday', 'period=7d', 'period=ytd']) expect(view(p).compare, p).toBe('previous')
    expect(view('period=yesterday&compare=none').compare).toBe('none')
    expect(writeView(view('period=yesterday&compare=none'))).toBe('?period=yesterday&compare=none')
    expect(writeView(view('period=yesterday'))).toBe('?period=yesterday')
  })

  it('still asks the report for the period before, which the tiles need the moment a comparison is turned on', () => {
    const v = view('period=custom&from=2026-09-20&to=2026-09-26')
    expect(queryOf(v, rangeOf(v, '2026-09-30')).compare).toBe('previous')
  })

  it('exports without the comparison, so the file has no comparison row', () => {
    const none = view('period=custom&from=2026-09-20&to=2026-09-26')
    const q = queryOf(none, rangeOf(none, '2026-09-30'))
    expect(q.compare).toBeDefined()
    const out = exportQuery(none, q)
    expect([out.compare, out.cfrom, out.cto]).toEqual([undefined, undefined, undefined])
    expect(out.from).toBe(q.from)
    expect(out.to).toBe(q.to)
    expect(out.filters).toEqual(q.filters)
  })

  it('exports with the comparison the page showed', () => {
    const year = view('period=custom&from=2026-09-20&to=2026-09-26&compare=year')
    const q = queryOf(year, rangeOf(year, '2026-09-30'))
    expect(exportQuery(year, q)).toBe(q)
    expect(q.compare).toBe('year')
  })
})
