import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Busier } from './api'
import { BusierLine } from './BusierLine'
import { clock, parts, shown } from './busier'

// 14:32 in Tirana (UTC+2 in October)
const SINCE = Date.UTC(2026, 9, 6, 12, 32, 0) / 1000
const base: Busier = { now: 50, baseline: true, usual: 20, low: 17, high: 24, state: 'busier', since: SINCE, rest: 1, why: [] }
const albas: Busier = {
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

describe('the panel', () => {
  it('tells the sources, the page, the start and that it goes on', () => {
    expect(parts(albas, 'Europe/Tirane').join(' · ')).toBe('+22 from Facebook → mostly /products/summer · +6 from Google · the rest as usual · Started 14:32 · still going')
  })
  it('says what is left when the named sources do not explain most of it', () => {
    expect(parts({ ...albas, rest: 12 }, 'UTC')).toContain('+12 from elsewhere')
  })
  it('names a country and a campaign, and a page when no source stands out', () => {
    const b: Busier = { ...base, rest: 0, why: [{ dim: 'page', value: '/', now: 30, usual: 5, plus: 25 }, { dim: 'country', value: 'DE', now: 20, usual: 2, plus: 18 }, { dim: 'campaign', value: 'sep', now: 9, usual: 0, plus: 9 }] }
    expect(parts(b, 'UTC').slice(0, 3)).toEqual(['+25 on /', '+18 from Germany', '+9 from the campaign sep'])
  })
  it('says so when nothing stands out, and when it began before the look back', () => {
    const p = parts({ ...base, since_capped: true }, 'UTC')
    expect(p[0]).toBe('No single source stands out.')
    expect(p).toContain('Since before 12:32')
  })
  it('writes the time in the site’s zone', () => {
    expect(clock(SINCE, 'Europe/Tirane')).toBe('14:32')
    expect(clock(SINCE, 'Not/AZone')).toBe('12:32')
  })
})

describe('the line', () => {
  it('is one sentence with a Why? button', () => {
    const html = renderToStaticMarkup(<BusierLine busier={albas} timezone="UTC" />)
    expect(html).toContain('Busier than usual: 50 vs ~20.')
    expect(html).toContain('Why?')
    expect(html).toContain('aria-expanded="false"')
  })
  it('is not there in a normal hour', () => {
    expect(renderToStaticMarkup(<BusierLine busier={{ ...base, state: '' }} timezone="UTC" />)).toBe('')
    expect(renderToStaticMarkup(<BusierLine busier={null} timezone="UTC" />)).toBe('')
  })
})
