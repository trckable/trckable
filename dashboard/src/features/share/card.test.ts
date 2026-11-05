import { describe, expect, it } from 'vitest'
import { accentsFor, cardUrl, fileName, periodOf, statsFor, statsWith, toggleStat, type Look } from './card'

const look: Look = { template: 'leaderboard', period: '24h', metric: 'visitors', stats: ['engaged', 'avgtime', 'country'], theme: 'light', accent: '#4f8cff' }

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
