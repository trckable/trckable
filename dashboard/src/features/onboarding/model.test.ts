import { describe, expect, it } from 'vitest'
import type { Visit } from '../../lib/api'
import { cameFrom, finishPath, firstVisited, stepAt } from './model'

describe('first run', () => {
  it('has three steps, one per screen', () => {
    expect(['site', 'install', 'here'].map((s) => stepAt(s as never))).toEqual([0, 1, 2])
  })
  it('moves on for the first of any site to get a visit', () => {
    const v: Visit = { kind: 'pageview', ts: 0, visitor: 'a', path: '/' }
    expect(firstVisited(['a', 'b'], { a: [], b: [v] })).toBe('b')
    expect(firstVisited(['a', 'b'], { a: [v], b: [v] })).toBe('a')
    expect(firstVisited(['a', 'b'], {})).toBeNull()
  })
  it('says where the first visit came from, when it knows', () => {
    const v: Visit = { kind: 'pageview', ts: 0, path: '/', referrer: 'https://www.news.example.org/story?x=1', country: 'DE', city: 'Berlin' }
    expect(cameFrom(v)).toBe('news.example.org · Berlin, Germany')
    expect(cameFrom({ kind: 'pageview', ts: 0, path: '/' })).toBe('')
    expect(cameFrom(undefined)).toBe('')
  })
  it('ends in Live mode', () => {
    expect(finishPath('example.com', true)).toBe('/example.com?view=live')
    expect(finishPath('example.com', false)).toBe('/example.com')
  })
})
