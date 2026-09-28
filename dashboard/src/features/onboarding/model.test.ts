import { describe, expect, it } from 'vitest'
import type { Visit } from '../../lib/api'
import { cleanDomain, dotOf, finishPath, tally } from './model'

describe('first run', () => {
  it('turns what people type into a domain', () => {
    expect(cleanDomain(' https://www.Example.com/pricing?x=1 ')).toBe('example.com')
    expect(cleanDomain('shop.example.co.uk:8080')).toBe('shop.example.co.uk')
    expect(cleanDomain('')).toBe('')
  })
  it('shows three dots, the last two screens sharing the third', () => {
    expect(['site', 'install', 'here', 'done'].map((s) => dotOf(s as never))).toEqual([0, 1, 2, 2])
  })
  it('counts people and pageviews from the stream', () => {
    const v = (visitor: string, kind: Visit['kind'] = 'pageview'): Visit => ({ kind, ts: 0, visitor, path: '/' })
    expect(tally([v('a'), v('a'), v('b'), v('b', 'goal')])).toEqual({ visitors: 2, pageviews: 3 })
  })
  it('ends in Live mode', () => {
    expect(finishPath('example.com', true)).toBe('/example.com?view=live')
    expect(finishPath('example.com', false)).toBe('/example.com')
  })
})
