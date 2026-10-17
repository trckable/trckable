import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addDays, PRESETS, type ISODate } from '../lib/dates'
import { DatePicker, type PickerValue } from './DatePicker'
import { Periods } from './DateRangePeriods'
import { withCustom } from './compareCustom'
import { PERIODS_FIRST, PERIODS_MORE } from './dateRangeCopy'

const TODAY = '2026-09-30' as ISODate
function preset(id: string) {
  const p = PRESETS.find((x) => x.id === id)
  if (!p) throw new Error('no period ' + id)
  return p
}
const at = (id: string): PickerValue => ({ period: id, range: preset(id).range(TODAY), compare: 'none' })
const noop = () => {}

function periods(v: PickerValue) {
  return renderToStaticMarkup(<Periods value={v} today={TODAY} tz="Europe/Berlin" bucket={undefined} autoBucket="hour" onBucket={noop} onPeriod={noop} onCompare={noop} onCustom={noop} />)
}

describe('the period list', () => {
  it('is six rows, then More, with no section headers, subtitles or clock', () => {
    const html = periods(at('30d'))
    for (const id of PERIODS_FIRST) expect(html).toContain(preset(id).label)
    expect(html).toContain('More')
    expect(html).not.toMatch(/Rolling|Calendar|A second line|Berlin</)
    expect(html).not.toContain('periods-head')
  })

  it('keeps every other period, the detail and custom dates under More', () => {
    const html = periods(at('30d'))
    for (const id of PERIODS_MORE) expect(html).toContain(preset(id).label)
    for (const word of ['Detail', 'Custom dates']) expect(html).toContain(word)
    // Closed, that part cannot be tabbed into.
    expect(html).toMatch(/class="ld-x"><div inert/)
  })

  it('opens More at once when what is chosen lives there', () => {
    expect(periods(at('wtd'))).toContain('class="ld-x open"')
    expect(periods(at('7d'))).toContain('class="ld-x"')
  })

  it('shows a key as a hint only (hidden until the row is pointed at) and ticks the chosen one', () => {
    const html = periods(at('7d'))
    expect(html).toContain('class="k"')
    expect(html).toMatch(/aria-pressed="true"[^>]*data-initial/)
  })

  it('puts the comparison choices in the same list, outside More', () => {
    const html = periods(at('30d'))
    expect(html.indexOf('aria-label="No comparison"')).toBeGreaterThan(-1)
    expect(html.indexOf('aria-label="Period before"')).toBeLessThan(html.indexOf('ld-more'))
    expect(html).toMatch(/aria-pressed="true" aria-label="No comparison">Off</)
  })

  it('marks the chosen comparison', () => {
    const html = periods({ ...at('30d'), compare: 'year' })
    expect(html).toMatch(/aria-pressed="true" aria-label="Last year">Last year</)
  })

  it('offers no comparison on a page that has none', () => {
    const html = renderToStaticMarkup(<Periods value={at('30d')} today={TODAY} onPeriod={noop} onCustom={noop} />)
    expect(html).not.toContain('aria-label="Period before"')
  })
})

describe('the period control', () => {
  const control = (v: PickerValue) => renderToStaticMarkup(<DatePicker value={v} today={TODAY} onChange={noop} />)
  it('is one button: the period, and a small tag while a comparison is on', () => {
    const html = control({ ...at('30d'), compare: 'previous' })
    expect(html).toContain('± vs before')
    expect(html).toContain('Last 30 days')
    expect(html).not.toContain('cmp-btn')
    expect(html).toContain('vs the 30 days before')
  })

  it('has no tag without a comparison', () => {
    expect(control(at('30d'))).not.toContain('range-cmp')
  })
})

describe('the comparison', () => {
  it('starts a custom comparison on the period before', () => {
    const v = withCustom({ ...at('7d'), compare: 'custom' })
    expect(v.compareCustom).toEqual({ from: addDays(TODAY, -13), to: addDays(TODAY, -7) })
    expect(withCustom(at('7d')).compareCustom).toBeUndefined()
  })
})
