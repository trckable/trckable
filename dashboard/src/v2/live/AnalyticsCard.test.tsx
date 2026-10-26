// @vitest-environment happy-dom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnalyticsCard } from './AnalyticsCard'

const today = (visitors: number, before: number) => ({ visitors, before, compare: before > 0, hours: [], last: [] })
const draw = (t: ReturnType<typeof today>) => renderToStaticMarkup(createElement(AnalyticsCard, { today: t, timezone: 'UTC' }))

describe("Today's number on the Analytics card", () => {
  it('has one quiet line under it, with the tone on the arrow and the figure only', () => {
    const html = draw(today(132, 100))
    expect(html).toMatch(/<p class="lusual" data-tone="up"><b>↑ 32%<\/b> above a usual [A-Z][a-z]+day<\/p>/)
    expect(html).not.toContain('mk-tag')
  })
  it('says a quiet day below, and about usual inside the band', () => {
    expect(draw(today(78, 100))).toContain('↓ 22%')
    expect(draw(today(105, 100))).toContain('About usual')
  })
  it('says nothing when last week had too few people to measure against', () => {
    expect(draw(today(30, 10))).not.toContain('lusual')
  })
})
