import { describe, expect, it } from 'vitest'
import { cardSvg, type Look } from './ShareCard'

const data = {
  domain: 'example.com',
  name: 'Example',
  period: 'Sep 1 – Sep 25',
  visitors: 18273,
  pageviews: 42059,
  prevVisitors: 13800,
  revenue: { now: 3421600, fmt: (n: number) => '€' + Math.round(n / 100).toLocaleString('en-US') },
  series: [1, 3, 2, 5, 4],
  compare: { label: 'vs last year', series: [1, 1, 2, 2, 3] },
}
const all = { lead: 'visitors', extras: ['pageviews'], change: true, chart: true, format: 'post' } as const satisfies Look
const look = (o: Partial<Look> = {}): Look => ({ ...all, extras: [...all.extras], ...o })

describe('share card', () => {
  it('shows the numbers switched on, and never money unless asked', () => {
    const svg = cardSvg(data, 'glow', look(), 'Example')
    expect(svg).toContain('18,273')
    expect(svg).toContain('42,059')
    expect(svg).toContain('+32%')
    expect(svg).toContain('vs last year')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).not.toContain('€')
    expect(cardSvg(data, 'glow', look({ extras: ['revenue'] }), 'Example')).toContain('€34,216')
  })

  it('is branded and escapes what the owner types', () => {
    const svg = cardSvg(data, 'paper', look(), '<b>A & B</b>')
    expect(svg).toContain('Counted by')
    expect(svg).toContain('&lt;b&gt;A &amp; B&lt;/b&gt;')
    expect(svg).not.toContain('<b>')
  })

  it('leads with the number picked, adds at most three more, and fits every size', () => {
    const d = { ...data, bounce: 0.42, visitTime: 95, topSource: 'Google', topCountry: 'Germany' }
    const svg = cardSvg(d, 'glow', look({ lead: 'pageviews', extras: ['bounce', 'time', 'source', 'country'], format: 'story' }), 'Example')
    expect(svg).toContain('width="1080" height="1920"')
    expect(svg).toContain('42,059')
    expect(svg).toContain('42%')
    expect(svg).toContain('Google')
    expect(svg).not.toContain('Germany')
    expect(cardSvg(d, 'glow', look({ format: 'square' }), 'Example')).toContain('width="1080" height="1080"')
    // The extras never repeat the big number.
    expect(cardSvg(d, 'glow', look({ lead: 'pageviews', extras: ['pageviews'] }), 'Example').match(/42,059/g)).toHaveLength(1)
  })

  it('animates for the GIF: counts up from zero and ends on the still card', () => {
    const first = cardSvg(data, 'glow', look(), 'Example', 0)
    expect(first).toContain('>0</text>')
    expect(first).not.toContain('18,273')
    expect(first).toContain('Counted by') // the brand is in every frame
    expect(cardSvg(data, 'glow', look(), 'Example', 1)).toBe(cardSvg(data, 'glow', look(), 'Example'))
  })

  it('draws a milestone as one big number, what it is and when', () => {
    const svg = cardSvg({ ...data, milestone: { value: '10,000', label: 'visitors, all time', sub: 'Reached on Sep 25' } }, 'bold', look(), 'Example')
    expect(svg).toContain('10,000')
    expect(svg).toContain('visitors, all time')
    expect(svg).toContain('Reached on Sep 25')
    expect(svg).toContain('example.com')
    expect(svg).not.toContain('18,273')
  })
})
