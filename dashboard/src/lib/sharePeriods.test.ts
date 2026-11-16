import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { SharePeriod } from '../v2/ui/SharePeriod'
import fixture from './sharePeriods.json'
import { addDays, addMonths, presetById } from './dates'
import { setShared } from './me'
import { SHARE_DEFAULT, SHARE_PERIODS, sharePeriodOf } from './sharePeriods'
import { readView, writeView } from './url'

const TODAY = '2026-11-16'

describe('the periods of a shared link', () => {
  it('are 7 days, 30 days (the default) and 12 months', () => {
    expect(SHARE_PERIODS).toEqual(['7d', '30d', '12mo'])
    expect(SHARE_DEFAULT).toBe('30d')
  })
  it('are the dashboard presets with the lengths the server keeps', () => {
    for (const p of fixture.periods) {
      const r = presetById(p.id)?.range(TODAY)
      expect(r?.to).toBe(TODAY)
      expect(r?.from).toBe(p.days ? addDays(TODAY, 1 - p.days) : addDays(addMonths(TODAY, -(p.months ?? 0)), 1))
    }
  })
  it('turn anything else into the default', () => {
    expect(sharePeriodOf('7d')).toBe('7d')
    expect(sharePeriodOf('90d')).toBe('30d')
    expect(sharePeriodOf('custom')).toBe('30d')
    expect(sharePeriodOf(null)).toBe('30d')
  })
})

describe('the switch', () => {
  it('shows each period, the chosen one marked, with the full words as titles', () => {
    const html = renderToStaticMarkup(createElement(SharePeriod, { value: '30d', onPick: () => undefined }))
    expect(html).toContain('>7d<')
    expect(html).toContain('>12mo<')
    expect(html).toContain('title="Last 30 days"')
    expect(html).toContain('aria-selected="true" class="on"')
  })
  it('is not there when only one period is offered', () => {
    expect(renderToStaticMarkup(createElement(SharePeriod, { value: '30d', onPick: () => undefined, offered: ['30d'] }))).toBe('')
  })
})

describe('the address of a shared link', () => {
  beforeEach(() => setShared())
  it('opens on 30 days, with no comparison', () => {
    const v = readView(new URLSearchParams(''))
    expect(v.period).toBe('30d')
    expect(v.compare).toBe('none')
  })
  it('cannot name dates, another period or a comparison', () => {
    const v = readView(new URLSearchParams('from=2020-01-01&to=2020-03-01&compare=year&cfrom=2019-01-01&cto=2019-03-01&period=90d&bucket=hour'))
    expect(v).toMatchObject({ period: '30d', from: undefined, to: undefined, compare: 'none', cfrom: undefined, cto: undefined, bucket: undefined })
    expect(readView(new URLSearchParams('period=12mo')).period).toBe('12mo')
  })
  it('writes no comparison into the address', () => {
    expect(writeView(readView(new URLSearchParams('period=7d')))).toBe('?period=7d')
  })
})
