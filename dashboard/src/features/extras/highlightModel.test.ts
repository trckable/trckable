import { describe, expect, it } from 'vitest'
import type { Insight } from './extrasApi'
import { highlightRows } from './highlightModel'

const usd = (n: number) => `$${(n / 100).toFixed(2)}`

describe('highlights', () => {
  it('words each kind with the report’s own figures and names the filter a click applies', () => {
    const list: Insight[] = [
      { kind: 'source_move', dim: 'channel', value: 'AI', now: 300, was: 100, change: 2 },
      { kind: 'source_move', dim: 'channel', value: 'Social', now: 50, was: 400, change: -0.875 },
      { kind: 'top_revenue', dim: 'channel', value: 'Email', now: 200, revenue: 12000, per_visitor: 60.4, times: 2.4 },
      { kind: 'conversion_drop', dim: 'entry_page', value: '/pricing', now: 1000, was: 1000, rate: 0.01, was_rate: 0.03 },
      { kind: 'new_referrer', dim: 'referrer', value: 'news.example', now: 50 },
    ]
    const rows = highlightRows(list, usd)
    expect(rows.map((r) => r.text)).toEqual([
      'AI assistants up 200% · 100 → 300 visitors',
      'Social down 88% · 400 → 50 visitors',
      'Email earns $0.60 a visitor, 2.4× the average',
      '/pricing converts 1.0%, was 3.0%',
      'New referrer: news.example sent 50 visitors',
    ])
    expect(rows.map((r) => r.tone)).toEqual(['up', 'down', 'money', 'warn', 'new'])
    expect(rows.map((r) => [r.dim, r.value])).toEqual([['channel', 'AI'], ['channel', 'Social'], ['channel', 'Email'], ['entry_page', '/pricing'], ['referrer', 'news.example']])
  })

  it('leaves out the percentage when the earlier figure is tiny, and caps a huge one', () => {
    const list: Insight[] = [
      { kind: 'source_move', dim: 'channel', value: 'Direct', now: 1414, was: 1, change: 1413 },
      { kind: 'source_move', dim: 'channel', value: 'Search', now: 1000, was: 50, change: 19 },
    ]
    expect(highlightRows(list, usd).map((r) => r.text)).toEqual(['Direct up · 1 → 1,414 visitors', 'Search up more than 10x · 50 → 1,000 visitors'])
  })

  it('is empty when the server found nothing', () => {
    expect(highlightRows([], usd)).toEqual([])
  })
})
