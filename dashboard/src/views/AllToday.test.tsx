import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site, SiteRow } from '../lib/api'
import { AllToday } from './AllToday'

const NOW = Date.UTC(2026, 9, 15, 12)
const row = { id: 'q', domain: 'q.com', name: '', visitors: 40, pageviews: 0, bounce_rate: 0, previous_visitors: 0, series: [5, 5, 5, 5, 5, 5, 5, 5, 1], online: 0, currency: 'USD', exponent: 2 } as SiteRow
const site = { id: 'q', domain: 'q.com', timezone: 'UTC', last_event_at: NOW / 1000 - 10 * 3600 } as Site

describe('a quiet row on the overview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('has a pill and a line that agree on how long', () => {
    const html = renderToString(<AllToday lens="visitors" rows={[row]} sites={[site]} surges={new Map()} colorOf={() => '#000'} start={0} period="Last 7 days" days={7} open={() => {}} />)
    expect(html).toContain('no visits 10h')
    expect(html).toContain('No visits for 10h')
    expect(html).not.toContain('no visits 1m')
  })
})
