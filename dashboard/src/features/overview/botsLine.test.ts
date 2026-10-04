import { describe, expect, it } from 'vitest'
import { botsLine } from './botsLine'

describe('the bots line in the Visitors tooltip', () => {
  it('says how many bots and AI crawlers were filtered', () => {
    expect(botsLine({ total: 1204, kinds: { bot: 1000, 'ai-crawler': 204 } })).toBe('1,204 bots and AI crawlers filtered')
    expect(botsLine({ total: 12, kinds: { hosting: 12 } })).toBe('12 bots and AI crawlers filtered')
  })
  it('says it in the singular for one', () => {
    expect(botsLine({ total: 1, kinds: { bot: 1 } })).toBe('1 bot or AI crawler filtered')
  })
  it('says nothing when none were filtered, or the report did not say', () => {
    expect(botsLine({ total: 0, kinds: {} })).toBeUndefined()
    expect(botsLine(undefined)).toBeUndefined()
  })
})
