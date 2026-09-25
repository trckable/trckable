import { describe, expect, it } from 'vitest'
import { cardSvg } from './ShareCard'

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
const all = { visitors: true, pageviews: true, revenue: false, change: true, chart: true }

describe('share card', () => {
  it('shows the numbers switched on, and never money unless asked', () => {
    const svg = cardSvg(data, 'glow', all, 'Example')
    expect(svg).toContain('18,273')
    expect(svg).toContain('42,059')
    expect(svg).toContain('+32%')
    expect(svg).toContain('vs last year')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).not.toContain('€')
    expect(cardSvg(data, 'glow', { ...all, revenue: true }, 'Example')).toContain('€34,216')
  })

  it('is branded and escapes what the owner types', () => {
    const svg = cardSvg(data, 'paper', all, '<b>A & B</b>')
    expect(svg).toContain('Counted by')
    expect(svg).toContain('&lt;b&gt;A &amp; B&lt;/b&gt;')
    expect(svg).not.toContain('<b>')
  })

  it('draws a milestone as one big number, what it is and when', () => {
    const svg = cardSvg({ ...data, milestone: { value: '10,000', label: 'visitors, all time', sub: 'Reached on Sep 25' } }, 'bold', all, 'Example')
    expect(svg).toContain('10,000')
    expect(svg).toContain('visitors, all time')
    expect(svg).toContain('Reached on Sep 25')
    expect(svg).toContain('example.com')
    expect(svg).not.toContain('18,273')
  })
})
