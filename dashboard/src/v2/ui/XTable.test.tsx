import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Row } from '../explore/types'
import { shareOf, XTable } from './XTable'

const row = (o: Partial<Row>): Row => ({ val: 'a', name: 'a', v: 10, c: 0, st: '', ...o })
const cells = (rows: Row[]) => [...renderToStaticMarkup(<XTable rows={rows} head="Page" limit={5} of={30} onAll={() => {}} />).matchAll(/<span class="d[^"]*">([^<]*)<\/span>/g)].map((m) => m[1])

describe('the vs usual column', () => {
  it('is never blank: about the same inside the usual, a dash with nothing to count from', () => {
    expect(cells([row({ c: 10 }), row({ val: 'b', c: 0 }), row({ val: 'c', c: 3, v: 9, st: 'up' })])).toEqual(['≈ same', '–', '▲ 3×'])
  })
})

describe('the share column', () => {
  const shares = (rows: Row[], of: number) => [...renderToStaticMarkup(<XTable rows={rows} head="Page" limit={5} of={of} onAll={() => {}} />).matchAll(/<span class="sh">([^<]*)<\/span>/g)].map((m) => m[1])
  it('is out of the period\'s people, not out of the rows on show', () => {
    // 3 of 100 people: the rows on show add up to 5, and a share of those would say 60%.
    expect(shares([row({ v: 3 }), row({ val: 'b', v: 2 })], 100)).toEqual(['3%', '2%'])
  })
  it('says under one percent rather than 0%, and never goes past 100%', () => {
    expect(shareOf(1, 500)).toBe('<1%')
    expect(shareOf(0, 500)).toBe('0%')
    expect(shareOf(520, 500)).toBe('100%')
    expect(shareOf(250, 500)).toBe('50%')
  })
})
