import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Block } from './Block'
import { Compare } from './Compare'
import { IncidentTimeline } from './IncidentTimeline'
import { LineBlock } from './LineBlock'
import { MentionsList } from './MentionsList'
import { NumberCard } from './NumberCard'
import { RankedTable } from './RankedTable'
import { amountText } from './format'
import type { CompareBlock, IncidentsBlock, LineBlock as Line, MentionsBlock, NumberBlock, RankedBlock } from './types'

const period = { from: '2026-10-12', to: '2026-10-18', label: 'This week' }
const html = (n: React.ReactElement) => renderToStaticMarkup(n)

describe('amountText', () => {
  it('says each unit the way its page does', () => {
    expect(amountText(1234, { unit: 'count' })).toBe('1,234')
    expect(amountText(42.4, { unit: 'percent' })).toBe('42%')
    expect(amountText(4.25, { unit: 'percent' })).toBe('4.3%')
    expect(amountText(8700, { unit: 'money', currency: 'USD', exponent: 2 })).toBe('$87')
    expect(amountText(320, { unit: 'ms' })).toBe('320 ms')
  })
})

describe('NumberCard', () => {
  const b: NumberBlock = { type: 'number', title: 'Visitors', period, explore: '/x.example', data: { unit: 'count', value: 1500, previous: 1000 } }
  it('shows the value, the change against the period before, and the period', () => {
    const out = html(<NumberCard b={b} />)
    expect(out).toContain('1,500')
    expect(out).toContain('+50%')
    expect(out).toContain('This week')
    expect(out).toContain('href="/x.example"')
  })
  it('says nothing about a change when there is nothing before', () => {
    expect(html(<NumberCard b={{ ...b, data: { unit: 'count', value: 5 } }} />)).not.toContain('blk-delta')
  })
  it('never links outside the dashboard', () => {
    expect(html(<NumberCard b={{ ...b, explore: 'https://evil.example' }} />)).not.toContain('<a')
    expect(html(<NumberCard b={{ ...b, explore: '//evil.example' }} />)).not.toContain('<a')
  })
  it('reads a lower-is-better move as good when it falls', () => {
    const out = html(<NumberCard b={{ ...b, data: { unit: 'percent', value: 40, previous: 50, invert: true } }} />)
    expect(out).toContain('data-tone="up"')
  })
})

describe('LineBlock', () => {
  it('draws the points through the Live chart and names the ends', () => {
    const b: Line = { type: 'line', title: 'Visitors', data: { unit: 'count', points: [1, 4, 2, 8], labels: ['Oct 12', 'Oct 18'] } }
    const out = html(<LineBlock b={b} />)
    expect(out).toContain('mline-in')
    expect(out).toContain('Oct 12')
    expect(out).toContain('Oct 18')
  })
})

describe('RankedTable', () => {
  const b: RankedBlock = { type: 'ranked', title: 'Top pages', data: { unit: 'count', rows: [{ label: '/', value: 100, before: 80 }, { label: '/pricing', value: 50 }] } }
  it('draws each row with its bar against the biggest', () => {
    const out = html(<RankedTable b={b} />)
    expect(out).toContain('width:100%')
    expect(out).toContain('width:50%')
    expect(out).toContain('/pricing')
    expect(out).toContain('25% ↑')
  })
  it('says so when there is nothing to rank', () => {
    expect(html(<RankedTable b={{ ...b, data: { unit: 'count', rows: [] } }} />)).toContain('Nothing to rank')
  })
})

describe('IncidentTimeline', () => {
  const b: IncidentsBlock = {
    type: 'incidents',
    title: 'Downtime',
    data: { uptime: 99.5, incidents: [{ id: 'b', kind: 'quiet', started_at: 2000, ended_at: null, cause: 'no visits' }, { id: 'a', kind: 'down', started_at: 1000, ended_at: 1000 + 3 * 3600, cause: 'timeout' }] },
  }
  it('lists the incidents oldest first with how long, and the uptime', () => {
    const out = html(<IncidentTimeline b={b} now={5000} />)
    expect(out.indexOf('timeout')).toBeLessThan(out.indexOf('no visits'))
    expect(out).toContain('for 3h')
    expect(out).toContain('Still going')
    expect(out).toContain('99.5% up')
  })
  it('says no downtime when there is none', () => {
    expect(html(<IncidentTimeline b={{ ...b, data: { uptime: null, incidents: [] } }} />)).toContain('No downtime')
  })
})

describe('MentionsList', () => {
  const m = { id: 1, source: 'hn' as const, url: 'https://news.ycombinator.com/item?id=1', title: 'Show HN: Trckable', author: 'sam', points: 120, posted_at: 1, visitors: 42 }
  it('lists the mention with its place, link and the visitors it brought', () => {
    const b: MentionsBlock = { type: 'mentions', title: 'Mentions', data: { mentions: [m] } }
    const out = html(<MentionsList b={b} />)
    expect(out).toContain('Show HN: Trckable')
    expect(out).toContain('Hacker News')
    expect(out).toContain('42 visitors')
    expect(out).toContain('noopener')
  })
  it('does not link an address that is not a web address', () => {
    const b: MentionsBlock = { type: 'mentions', title: 'Mentions', data: { mentions: [{ ...m, url: 'javascript:alert(1)' }] } }
    expect(html(<MentionsList b={b} />)).not.toContain('javascript:')
  })
})

describe('Compare', () => {
  it('puts both periods on one scale with the change', () => {
    const b: CompareBlock = { type: 'compare', title: 'Visitors', data: { unit: 'count', current: { label: 'This week', value: 200 }, previous: { label: 'Last week', value: 100 } } }
    const out = html(<Compare b={b} />)
    expect(out).toContain('width:100%')
    expect(out).toContain('width:50%')
    expect(out).toContain('+100%')
  })
})

describe('Block', () => {
  it('draws each type', () => {
    const b: NumberBlock = { type: 'number', title: 'T', data: { unit: 'count', value: 3 } }
    expect(html(<Block block={b} />)).toContain('blk-num')
  })
})
