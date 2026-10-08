import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { cells, nextRoll, RollingNumber, type Roll } from './RollingNumber'

const start = (text: string, value: number): Roll => ({ cur: text, prev: text, value, dir: 1, n: 0 })
const fmt = (n: number) => n.toLocaleString('en-US')

describe('RollingNumber', () => {
  it('renders the value once for screen readers and as still digits', () => {
    const h = renderToStaticMarkup(<RollingNumber value={1234} format={fmt} />)
    expect(h).toContain('aria-live="polite"')
    expect(h).toContain('<span class="rn-text">1,234</span>')
    expect(h).toContain('aria-hidden="true"')
    expect(h).not.toContain('rn-slot')
  })
  it('moves only the changed digits, up when the number grows', () => {
    const r = nextRoll(start('1,299', 1299), 1300, '1,300', false)
    expect(r.dir).toBe(1)
    expect(cells(r.prev, r.cur).map((c) => c.moves)).toEqual([false, false, true, true, true])
  })
  it('rolls down when the number shrinks and aligns a shorter number to the right', () => {
    const r = nextRoll(start('1,000', 1000), 999, '999', false)
    expect(r.dir).toBe(-1)
    const c = cells(r.prev, r.cur)
    expect(c).toHaveLength(5)
    expect(c[0]).toEqual({ from: '1', to: '', moves: true })
    expect(c[1].moves).toBe(true)
  })
  it('swaps at once with reduced motion', () => {
    const r = nextRoll(start('8', 8), 9, '9', true)
    expect(r.cur).toBe('9')
    expect(r.prev).toBe('9')
    expect(cells(r.prev, r.cur).some((c) => c.moves)).toBe(false)
  })
  it('keeps the state when the text is unchanged', () => {
    const s = start('8', 8)
    expect(nextRoll(s, 8, '8', false)).toBe(s)
  })
})
