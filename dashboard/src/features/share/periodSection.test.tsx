import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PeriodSection } from './PeriodSection'
import type { Look } from './card'

const base: Look = { template: 'overview', shape: 'link', period: '30d', compare: false, metric: 'visitors', stats: ['engaged'], theme: 'dark', accent: '#b8ff3c' }
const draw = (l: Partial<Look>) => renderToStaticMarkup(<PeriodSection look={{ ...base, ...l }} tz="UTC" set={() => undefined} />)

describe('the period section', () => {
  it('offers the presets, all time and a custom range', () => {
    const html = draw({})
    for (const w of ['24 hours', '7 days', '30 days', 'All time', 'Custom range']) expect(html).toContain(w)
  })
  it('has the comparison off by default', () => expect(draw({})).toMatch(/aria-checked="false"[^>]*aria-label="Compare"|aria-label="Compare"[^>]*aria-checked="false"/))
  it('has the comparison on when asked for', () => expect(draw({ compare: true })).toMatch(/aria-checked="true"/))
  it('has no comparison for all time: nothing comes before it', () => expect(draw({ period: 'all' })).not.toContain('Compare'))
})
