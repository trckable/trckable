// @vitest-environment happy-dom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TodayStat } from './TodayStat'

const today = (visitors: number, before: number) => ({ visitors, before, compare: before > 0, hours: [], last: [] })
const draw = (t: ReturnType<typeof today>) => renderToStaticMarkup(createElement(TodayStat, { today: t, timezone: 'UTC' }))

describe("Today's people as the third figure on the Live card", () => {
  it('is labelled Today, with the climb in the up tone beneath the number', () => {
    const html = draw(today(132, 100))
    expect(html).toContain('<span class="ll">Today</span>')
    expect(html).toMatch(/<span class="mk-ld up">↑32% vs a usual [A-Z][a-z]+day<\/span>/)
    expect(html).not.toContain('mk-tag')
  })
  it('says the fall in the down tone, and about usual inside the band without a tone', () => {
    expect(draw(today(78, 100))).toMatch(/<span class="mk-ld dn">↓22% vs a usual /)
    expect(draw(today(105, 100))).toContain('<span class="mk-ld">About usual</span>')
  })
  it('tells only the count when last week had too few people to measure against', () => {
    const html = draw(today(30, 10))
    expect(html).toContain('Today')
    expect(html).not.toContain('mk-ld')
  })
  it('says nothing before anyone came', () => {
    expect(draw(today(0, 100))).toBe('')
  })
})
