import { describe, expect, it } from 'vitest'
import { accentsFor, cardUrl, fileName, type Look } from './card'

const look: Look = { template: 'leaderboard', period: '24h', metric: 'visitors', theme: 'light', accent: '#4f8cff' }

describe('cardUrl', () => {
  it('asks for the picture with every choice', () => {
    const u = new URL(cardUrl('s 1', look), 'http://x')
    expect(u.pathname).toBe('/api/v1/sites/s%201/card')
    expect(Object.fromEntries(u.searchParams)).toEqual({ period: '24h', metric: 'visitors', t: 'leaderboard', theme: 'light', accent: '#4f8cff' })
  })
  it('asks for the words without the look', () => {
    const u = new URL(cardUrl('s', look, 'json'), 'http://x')
    expect(Object.fromEntries(u.searchParams)).toEqual({ period: '24h', metric: 'visitors', format: 'json' })
  })
  it('names the file', () => expect(fileName('example.com', look)).toBe('trckable-example.com-leaderboard-24h.png'))
  it('puts the site colour first, once', () => {
    expect(accentsFor('#123ABC')[0]).toBe('#123abc')
    expect(accentsFor('#b8ff3c')).toHaveLength(5)
    expect(accentsFor('red')).toHaveLength(5)
  })
})
