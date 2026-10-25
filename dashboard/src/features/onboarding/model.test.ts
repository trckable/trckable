import { describe, expect, it } from 'vitest'
import type { Visit } from '../../lib/api'
import { factsOf, finishPath, firstVisited, stepAt } from './model'

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
  it('lists what the first visit tells, only what is known', () => {
    const v: Visit = { kind: 'pageview', ts: 0, path: '/pricing', referrer: 'https://www.news.example.org/story?x=1', country: 'DE', city: 'Berlin' }
    expect(factsOf(v)).toEqual([
      { kind: 'page', value: '/pricing' },
      { kind: 'source', value: 'news.example.org' },
      { kind: 'country', value: 'Berlin, Germany' },
    ])
    expect(factsOf({ kind: 'pageview', ts: 0, path: '/' })).toEqual([{ kind: 'page', value: '/' }, { kind: 'source', value: null }])
    expect(factsOf(undefined)).toEqual([])
  })
  it('ends in Live mode', () => {
    expect(finishPath('example.com', true)).toBe('/example.com?view=live')
    expect(finishPath('example.com', false)).toBe('/example.com')
  })
})
