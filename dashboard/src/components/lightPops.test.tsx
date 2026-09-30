import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addDays, PRESETS, type ISODate } from '../lib/dates'
import { CompareControl } from './CompareMenu'
import type { PickerValue } from './DatePicker'
import { Periods } from './DateRangePeriods'
import { filterCopy } from './filterCopy'
import FilterPop from './FilterPop'
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
  it('is five rows, then More, with no section headers, subtitles or clock', () => {
    const html = periods(at('30d'))
    for (const id of PERIODS_FIRST) expect(html).toContain(preset(id).label)
    expect(html).toContain('More')
    expect(html).not.toMatch(/Rolling|Calendar|A second line|Berlin</)
    expect(html).not.toContain('periods-head')
  })

  it('keeps every other period, the comparison, the detail and custom dates under More', () => {
    const html = periods(at('30d'))
    for (const id of PERIODS_MORE) expect(html).toContain(preset(id).label)
    for (const word of ['Period before', 'Last year', 'Custom', 'Detail', 'Custom dates']) expect(html).toContain(word)
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

  it('marks the chosen comparison', () => {
    const html = periods({ ...at('30d'), compare: 'year' })
    expect(html).toMatch(/aria-pressed="true">Last year</)
  })
})

describe('the comparison control', () => {
  it('is an icon named Compare while there is none: no "no comparison" label', () => {
    const html = renderToStaticMarkup(<CompareControl value={at('30d')} onChange={noop} />)
    expect(html).toContain('aria-label="Compare"')
    expect(html).toContain('title="Compare (C)"')
    expect(html).not.toMatch(/no comparison/i)
    expect(html).not.toContain('cmp-words')
  })

  it('says its words once one is set', () => {
    const html = renderToStaticMarkup(<CompareControl value={{ ...at('yesterday'), compare: 'previous' }} onChange={noop} />)
    expect(html).toContain('vs the day before')
  })

  it('starts a custom comparison on the period before', () => {
    const v = withCustom({ ...at('7d'), compare: 'custom' })
    expect(v.compareCustom).toEqual({ from: addDays(TODAY, -13), to: addDays(TODAY, -7) })
    expect(withCustom(at('7d')).compareCustom).toBeUndefined()
  })
})

describe('the filter list', () => {
  const rows = (dim: string) => (dim === 'channel' ? [{ value: 'Direct', visitors: 5 }, { value: 'Search', visitors: 3 }] : []) as never
  const list = (active: { dim: string; value: string }[]) =>
    renderToStaticMarkup(<FilterPop rows={rows} labelFor={(_, v) => v} active={active} onPick={noop} onRemove={noop} onClear={noop} root={{ current: null }} onClose={noop} />)

  it('has no Done button and folds what has nothing to pick into one row', () => {
    const html = list([])
    expect(html).not.toContain('>Done<')
    expect(html.match(new RegExp(filterCopy.idle, 'g'))).toHaveLength(1)
    expect(html).toContain('Channel')
    expect(html).not.toContain('>Acquisition<')
  })

  it('keeps Clear in the search line, only while a filter is on', () => {
    expect(list([])).not.toContain('Clear')
    const html = list([{ dim: 'channel', value: 'Direct' }])
    expect(html).toContain('Clear 1 filter<')
    expect(html.indexOf('type="search"')).toBeLessThan(html.indexOf('Clear 1 filter'))
  })

  it('has a placeholder short enough to show whole', () => {
    expect(filterCopy.placeholder.length).toBeLessThanOrEqual(24)
    expect(list([])).toContain(`placeholder="${filterCopy.placeholder}"`)
  })
})
