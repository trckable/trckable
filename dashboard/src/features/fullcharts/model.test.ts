import { describe, expect, it } from 'vitest'
import type { Charts } from './api'
import { convertModel, flowModel, funnelModel, moneyMapModel, rhythmModel, shortPath, sourcesModel, visitorsModel } from './model'

const charts: Charts = {
  labels: ['2026-09-10T00:00', '2026-09-11T00:00'],
  sources: [
    { channel: 'Search', total: 5, values: [2, 3] },
    { channel: 'AI', total: 2, values: [1, 1] },
    { channel: 'Other', other: true, total: 1, values: [0, 1] },
  ],
  visitors: { new: [2, 1], returning: [1, 4], unknown: 0 },
  flow: {
    visits: 4,
    steps: [
      [
        { kind: 'page', path: '/', visits: 3 },
        { kind: 'page', path: '/blog', visits: 1 },
      ],
      [
        { kind: 'page', path: '/pricing', visits: 1 },
        { kind: 'exit', visits: 3 },
      ],
      [{ kind: 'exit', visits: 1 }],
    ],
    links: [
      { step: 0, from: '/', to: '(exit)', visits: 2 },
      { step: 0, from: '/', to: '/pricing', visits: 1 },
      { step: 0, from: '/blog', to: '(exit)', visits: 1 },
      { step: 1, from: '/pricing', to: '(exit)', visits: 1 },
    ],
  },
}

describe('sources over time', () => {
  it('names channels as the rest of the dashboard does, in their own colours', () => {
    const m = sourcesModel(charts, 'day')
    expect(m.series.map((s) => s.label)).toEqual(['Search', 'AI assistants', 'Other'])
    expect(m.series[0].color).toBe('var(--ch-2)')
    expect(m.series[2].color).toBe('var(--text-3)')
    expect(m.table.columns).toEqual(['When', 'Search', 'AI assistants', 'Other'])
    expect(m.table.rows[1]).toEqual(['Fri, Sep 11', '3', '1', '1'])
  })
})

describe('new vs returning', () => {
  it('lists both lines per bucket', () => {
    const m = visitorsModel(charts, 'day')
    expect(m.series.map((s) => s.values)).toEqual([
      [2, 1],
      [1, 4],
    ])
    expect(m.table.rows[0]).toEqual(['Thu, Sep 10', '2', '1'])
  })
})

describe('visit to sale', () => {
  it('writes each step against the one before it', () => {
    const m = funnelModel([
      { kind: 'visit', visitors: 200, rate: 1 },
      { kind: 'goal', value: 'signup', visitors: 20, rate: 0.1 },
      { kind: 'sale', visitors: 5, rate: 0.25 },
    ])
    expect(m.rows.map((r) => r.label)).toEqual(['Visit', 'signup', 'Sale'])
    expect(m.rows.map((r) => r.share)).toEqual([1, 0.1, 0.025])
    expect(m.rows[0]).toEqual({ label: 'Visit', count: '200', share: 1 })
    expect(m.rows[1]).toMatchObject({ of: '10%', drop: '−90% · 180 left' })
    expect(m.rows[2]).toMatchObject({ count: '5', of: '25%', drop: '−75% · 15 left' })
    expect(m.table.rows[0]).toEqual(['Visit', '200', '–'])
  })
})

describe('time to convert', () => {
  it('keeps the spans in order with their words', () => {
    const m = convertModel([
      { span: 'visit', sales: 3 },
      { span: '3d', sales: 0 },
      { span: '7d', sales: 1 },
      { span: '14d', sales: 0 },
      { span: 'more', sales: 2 },
    ])
    expect(m.labels).toEqual(['Same visit', '0–3 days', '4–7 days', '8–14 days', '15+ days'])
    expect(m.values).toEqual([3, 0, 1, 0, 2])
  })
})

describe('weekday × hour', () => {
  it('reads the grid Monday first, with a total per day', () => {
    const cells = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
    cells[0][9] = 4 // Monday 09:00
    cells[3][10] = 1
    const m = rhythmModel({ cells, peak: 4, total: 5 })
    expect(m.table.rows[0][0]).toBe('Mon')
    expect(m.table.rows[0][10]).toBe('4')
    expect(m.table.rows[0][25]).toBe('4')
    expect(m.table.rows[3][0]).toBe('Thu')
  })
})

describe('revenue by country', () => {
  it('keeps only the countries that paid', () => {
    const m = moneyMapModel(
      [
        { value: 'DE', visitors: 0, revenue: 5000, customers: 2 },
        { value: 'US', visitors: 0, revenue: 0 },
      ],
      (n) => `$${n / 100}`,
    )
    expect(m.rows.map((r) => r.value)).toEqual(['DE'])
    expect(m.table.rows[0][1]).toBe('$50')
  })
})

describe('page flow', () => {
  it('turns nodes into boxes and links into rows with page names', () => {
    const m = flowModel(charts)
    expect(m.cols[1].map((c) => c.label)).toEqual(['/pricing', 'Left the site'])
    expect(m.cols[1][1].kind).toBe('exit')
    expect(m.links[0]).toEqual({ col: 0, from: '/', to: '(exit)', value: 2 })
    expect(m.table.rows[0]).toEqual(['/', 'Left the site', '2'])
  })
  it('shortens long paths from the front', () => {
    expect(shortPath('/docs/install/very-long-page-name')).toBe('…l/very-long-page-name')
    expect(shortPath('/pricing')).toBe('/pricing')
  })
})
