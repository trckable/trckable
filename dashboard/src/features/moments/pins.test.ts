import { describe, expect, it } from 'vitest'
import type { Insight } from '../extras/extrasApi'
import type { Moment } from '../story/moments'
import { byScore, pinsFromInsights, pinsFromMilestones, pinsFromMoments } from './pins'

const spike: Moment = { t: '2026-09-19T00:00', kind: 'spike', factor: 4.2, visitors: 816, referrer: 'news.example' }
const sale = (t: string, amount: number): Moment => ({ t, kind: 'sale', count: 2, amount, channel: 'Email' })

describe('pins from the server\'s moments', () => {
  it('a spike filters to its referrer and shows its day', () => {
    const [p] = pinsFromMoments([spike], true)
    expect(p).toMatchObject({ kind: 'spike', day: '2026-09-19', showDay: true, filters: [{ dim: 'referrer', value: 'news.example' }], n: { visitors: 816, factor: 4.2 } })
  })

  it('a spike with nobody behind it filters to nothing but its day', () => {
    const [p] = pinsFromMoments([{ ...spike, referrer: undefined }], true)
    expect(p.filters).toEqual([])
  })

  it('sales are weighed against the biggest day, and need money to be seen', () => {
    const list = [sale('2026-09-01T00:00', 1000), sale('2026-09-02T00:00', 4000)]
    const [a, b] = pinsFromMoments(list, true)
    expect(b.score).toBeGreaterThan(a.score)
    expect(pinsFromMoments(list, false)).toEqual([])
  })

  it('money milestones stay out where revenue is hidden, the others stay', () => {
    const list: Moment[] = [
      { t: '2026-09-05T00:00', kind: 'milestone', family: 'revenue', value: 1000, step: '1k' },
      { t: '2026-09-06T00:00', kind: 'milestone', family: 'visitors', value: 1000, step: '1k' },
    ]
    expect(pinsFromMoments(list, false).map((p) => p.n.family)).toEqual(['visitors'])
    expect(pinsFromMoments(list, true)).toHaveLength(2)
  })

  it('leaves out what the chart shows elsewhere: a country, a note', () => {
    expect(pinsFromMoments([{ t: '2026-09-01T00:00', kind: 'country', country: 'DE' }, { t: '2026-09-01T00:00', kind: 'note', text: 'x' }], true)).toEqual([])
  })

  it('an AI assistant\'s first visit filters to the AI channel, not to a day', () => {
    const [p] = pinsFromMoments([{ t: '2026-09-04T00:00', kind: 'ai', bot: 'ChatGPT' }], true)
    expect(p).toMatchObject({ kind: 'ai', showDay: false, filters: [{ dim: 'channel', value: 'AI' }], n: { name: 'ChatGPT' } })
  })
})

describe('pins from the findings', () => {
  const list: Insight[] = [
    { kind: 'source_move', dim: 'channel', value: 'Social', now: 900, was: 600, change: 0.5 },
    { kind: 'top_revenue', dim: 'channel', value: 'Email', now: 500, per_visitor: 444, times: 1.9 },
    { kind: 'conversion_drop', dim: 'entry_page', value: '/pricing', now: 1204, was: 1100, rate: 0.031, was_rate: 0.051, change: -0.4, since: '2026-09-12' },
    { kind: 'new_referrer', dim: 'referrer', value: 'linkedin.com', now: 463, since: '2026-09-13' },
  ]

  it('only a new referrer and a drop have a day, so only they can sit on the chart', () => {
    const pins = pinsFromInsights(list)
    expect(pins.map((p) => [p.kind, p.day])).toEqual([['move', undefined], ['pays', undefined], ['drop', '2026-09-12'], ['referrer', '2026-09-13']])
  })

  it('every one applies the filter the insight names, and never shows a day', () => {
    const pins = pinsFromInsights(list)
    expect(pins.map((p) => p.filters[0])).toEqual([{ dim: 'channel', value: 'Social' }, { dim: 'channel', value: 'Email' }, { dim: 'entry_page', value: '/pricing' }, { dim: 'referrer', value: 'linkedin.com' }])
    expect(pins.some((p) => p.showDay)).toBe(false)
  })

  it('a page that lost its buyers matters most, then the biggest spike, then the rest', () => {
    const pins = [...pinsFromInsights(list), ...pinsFromMoments([spike], true)].sort(byScore)
    expect(pins.map((p) => p.kind)).toEqual(['drop', 'spike', 'move', 'pays', 'referrer'])
  })
})

describe('pins from milestones', () => {
  it('only the ones this person has not seen', () => {
    const base = { value: 1000, day: '2026-09-10', created_at: 1, shared: false }
    const pins = pinsFromMilestones([
      { ...base, kind: 'visitors', step: '1k', new: true },
      { ...base, kind: 'pageviews', step: '1k', new: false },
    ])
    expect(pins.map((p) => p.id)).toEqual(['milestone:visitors:1k'])
  })
})
