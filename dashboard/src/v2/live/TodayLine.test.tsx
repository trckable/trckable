// @vitest-environment happy-dom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TodayLine } from './TodayLine'

const today = (visitors: number, before: number) => ({ visitors, before, compare: before > 0, hours: [], last: [] })
const draw = (t: ReturnType<typeof today>) => renderToStaticMarkup(createElement(TodayLine, { today: t, timezone: 'UTC' }))

describe("Today's people line on the Live card", () => {
  it('is one quiet line, with the tone on the arrow and the figure only', () => {
    const html = draw(today(132, 100))
    expect(html).toMatch(/<p class="lusual" data-tone="up">Today 132 people · <b>↑ 32%<\/b> above a usual [A-Z][a-z]+day<\/p>/)
    expect(html).not.toContain('mk-tag')
  })
  it('says a quiet day below, and about usual inside the band', () => {
    expect(draw(today(78, 100))).toContain('↓ 22%')
    expect(draw(today(105, 100))).toContain('About usual')
  })
  it('tells only the count when last week had too few people to measure against', () => {
    expect(draw(today(30, 10))).toContain('Today 30 people')
    expect(draw(today(30, 10))).not.toContain('·')
  })
  it('says nothing before anyone came', () => {
    expect(draw(today(0, 100))).toBe('')
  })
})
