import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Busier } from './api'
import { BusierLine } from './BusierLine'
import { asSurge, clock, parts, shown } from './busier'

// 14:32 in Tirana (UTC+2 in October)
const SINCE = Date.UTC(2026, 9, 6, 12, 32, 0) / 1000
const base: Busier = { now: 50, baseline: true, usual: 20, low: 17, high: 24, state: 'busier', since: SINCE, rest: 1, why: [] }
const jump: Busier = {
  ...base,
  why: [
    { dim: 'source', value: 'Facebook', now: 25, usual: 3, plus: 22 },
    { dim: 'page', value: '/products/summer', now: 22, usual: 2, plus: 20 },
    { dim: 'source', value: 'Google', now: 14, usual: 8, plus: 6 },
  ],
}

describe('when the line shows', () => {
  it('only for busier, and only with a usual', () => {
    expect(shown(base)).toBe('busier')
    expect(shown({ ...base, baseline: false })).toBeNull()
    expect(shown({ ...base, state: '' })).toBeNull()
    expect(shown(null)).toBeNull()
  })
  it('holds quieter back', () => {
    expect(shown({ ...base, state: 'quieter', now: 5 })).toBeNull()
  })
})

describe('the short line', () => {
  it('tells the biggest senders, the start and that it goes on, never a page', () => {
    expect(parts(jump, 'Europe/Tirane').join(' · ')).toBe('+22 from Facebook · +6 from Google · since 14:32 · still going')
    expect(parts(jump, 'UTC').join(' ')).not.toContain('/products')
  })
  it('keeps two senders at most, a country after the sources', () => {
    const b: Busier = { ...jump, why: [...jump.why, { dim: 'country', value: 'DE', now: 20, usual: 2, plus: 18 }] }
    expect(parts(b, 'UTC').slice(0, 2)).toEqual(['+22 from Facebook', '+6 from Google'])
    expect(parts({ ...base, why: [{ dim: 'country', value: 'DE', now: 20, usual: 2, plus: 18 }, { dim: 'campaign', value: 'sep', now: 9, usual: 0, plus: 9 }] }, 'UTC').slice(0, 2)).toEqual(['+18 from Germany', '+9 from the campaign sep'])
  })
  it('says so when nothing stands out, and when it began before the look back', () => {
    const p = parts({ ...base, since_capped: true }, 'UTC')
    expect(p[0]).toBe('No single source stands out.')
    expect(p).toContain('since before 12:32')
  })
  it('writes the time in the site’s zone', () => {
    expect(clock(SINCE, 'Europe/Tirane')).toBe('14:32')
    expect(clock(SINCE, 'Not/AZone')).toBe('12:32')
  })
  it('hands the busy-moment card the numbers and the page it lands on', () => {
    const s = asSurge(jump)
    expect(s).toMatchObject({ online: 50, usual: 20, started: SINCE, why: { source: 'Facebook', page: '/products/summer' } })
  })
})

describe('the line', () => {
  it('is one short line with a Why? button, and no card until asked', () => {
    const html = renderToStaticMarkup(<BusierLine busier={jump} site="s1" timezone="UTC" />)
    expect(html).toContain('Busier than usual: 50 vs ~20.')
    expect(html).toContain('Why?')
    expect(html).toContain('+22 from Facebook · +6 from Google · since 12:32 · still going')
    expect(html).not.toContain('/products')
    expect(html).not.toContain('mostly')
  })
  it('is not there in a normal hour', () => {
    expect(renderToStaticMarkup(<BusierLine busier={{ ...base, state: '' }} site="s1" timezone="UTC" />)).toBe('')
    expect(renderToStaticMarkup(<BusierLine busier={null} site="s1" timezone="UTC" />)).toBe('')
  })
})
