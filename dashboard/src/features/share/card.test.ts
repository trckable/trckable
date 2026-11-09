import { describe, expect, it } from 'vitest'
import { FORMATS, accentsFor, cardUrl, comparing, fileName, formatOf, periodOf, statsFor, statsWith, toggleStat, type Look } from './card'

const look: Look = { template: 'leaderboard', shape: 'link', period: '24h', metric: 'visitors', stats: ['engaged', 'avgtime', 'country'], theme: 'light', accent: '#4f8cff', compare: false }

describe('cardUrl', () => {
  it('asks for the picture with every choice', () => {
    const u = new URL(cardUrl('s 1', look), 'http://x')
    expect(u.pathname).toBe('/api/v1/sites/s%201/card')
    expect(Object.fromEntries(u.searchParams)).toEqual({ period: '24h', metric: 'visitors', t: 'leaderboard', theme: 'light', accent: '#4f8cff', stats: 'engaged,avgtime,country' })
  })
  it('asks for the words without the look', () => {
    const u = new URL(cardUrl('s', look, 'json'), 'http://x')
    expect(Object.fromEntries(u.searchParams)).toEqual({ period: '24h', metric: 'visitors', format: 'json' })
  })
  it('asks for a custom range with its two days, and for the comparison only when it is on', () => {
    const q = (l: Look) => Object.fromEntries(new URL(cardUrl('s', l), 'http://x').searchParams)
    expect(q({ ...look, period: 'custom', range: { from: '2026-10-01', to: '2026-10-31' } })).toMatchObject({ period: 'custom', from: '2026-10-01', to: '2026-10-31' })
    expect(q({ ...look, period: 'all' })).not.toHaveProperty('from')
    expect(q(look)).not.toHaveProperty('compare')
    expect(q({ ...look, compare: true })).toHaveProperty('compare', '1')
    expect(q({ ...look, compare: true, period: 'all' })).not.toHaveProperty('compare') // nothing comes before all time
  })
  it('compares only where there is a period before', () => {
    expect([comparing({ compare: true, period: '30d' }), comparing({ compare: true, period: 'all' }), comparing({ compare: false, period: '7d' })]).toEqual([true, false, false])
  })
  it('names the file for a preset and for a custom range', () => {
    expect(fileName('example.com', { ...look, period: 'custom', range: { from: '2026-10-01', to: '2026-10-31' } })).toBe('trckable-example.com-leaderboard-2026-10-01_2026-10-31.png')
    expect(fileName('example.com', { ...look, period: 'all' })).toBe('trckable-example.com-leaderboard-all.png')
  })
  it('names the file', () => expect(fileName('example.com', look)).toBe('trckable-example.com-leaderboard-24h.png'))
  it('takes the page\'s period as the nearest card period', () => {
    expect([periodOf('today'), periodOf('yesterday'), periodOf('7d'), periodOf('30d'), periodOf('90d'), periodOf('custom'), periodOf()]).toEqual(['24h', '24h', '7d', '30d', '30d', '30d', '30d'])
  })
  it('puts the site colour first, once', () => {
    expect(accentsFor('#123ABC')[0]).toBe('#123abc')
    expect(accentsFor('#b8ff3c')).toHaveLength(5)
    expect(accentsFor('red')).toHaveLength(5)
  })
  it('keeps three stats at most, the newest', () => {
    expect(toggleStat(['engaged', 'avgtime', 'country'], 'page')).toEqual(['avgtime', 'country', 'page'])
    expect(toggleStat(['engaged', 'avgtime'], 'engaged')).toEqual(['avgtime'])
    expect(toggleStat(['engaged'], 'engaged')).toEqual(['engaged'])
  })
  it('never shows the big number again as a stat', () => {
    expect(statsFor('pageviews', false)).not.toContain('pageviews')
    expect(statsFor('visitors', false)).not.toContain('revenue')
    expect(statsFor('visitors', true)).toContain('revenue')
    expect(statsWith(['engaged', 'country'], 'engaged')).toEqual(['country'])
    expect(statsWith(['engaged'], 'engaged')).toEqual(['avgtime', 'country'])
  })
})

describe('shape', () => {
  it('lists the sizes the server draws, the link preview first', () => {
    expect(FORMATS.map((f) => [f.id, f.w, f.h])).toEqual([['link', 1200, 630], ['square', 1080, 1080], ['story', 1080, 1920], ['wide', 1600, 900]])
    expect(formatOf('story')).toMatchObject({ w: 1080, h: 1920 })
  })
  it('asks for a shape only when it is not the link preview, and names the file by it', () => {
    const q = (shape: Look['shape']) => Object.fromEntries(new URL(cardUrl('s', { ...look, shape }), 'http://x').searchParams)
    expect(q('link')).not.toHaveProperty('shape')
    expect(q('square')).toHaveProperty('shape', 'square')
    expect(fileName('example.com', { ...look, shape: 'story', period: 'all' })).toBe('trckable-example.com-leaderboard-story-all.png')
  })
})
