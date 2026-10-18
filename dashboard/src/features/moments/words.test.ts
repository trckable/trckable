import { describe, expect, it } from 'vitest'
import type { Pin } from './pins'
import { say } from './words'

const usd = (n: number) => `$${(n / 100).toLocaleString('en-US')}`
const pin = (kind: Pin['kind'], over: Partial<Pin>): Pin => ({ id: kind, kind, score: 1, filters: [], showDay: false, n: {}, ...over })

describe('what a surge says', () => {
  it('is the source as a name and the people counted, never a cause', () => {
    const s = say(pin('surge', { day: '2026-10-06', n: { name: 'Facebook', visitors: 53, factor: 2.7 } }), usd)
    expect(s.title).toBe('Busier than usual')
    expect(s.line).toBe('Surge from Facebook')
    expect(s.big).toBe('53 visitors')
    expect(s.facts).toEqual(['2.7× the usual', 'Tue, Oct 6'])
  })
})

describe('what a pin says', () => {
  it('a spike: the line the rings said, the figure and who sent it', () => {
    const s = say(pin('spike', { day: '2026-09-19', n: { factor: 4.2, visitors: 816, referrer: 'news.example' } }), usd)
    expect(s.line).toBe('Spike · 4.2× the usual · mostly from news.example')
    expect(s.big).toBe('816 visitors')
    expect(s.facts).toEqual(['4.2× the usual', 'mostly from news.example', 'Sat, Sep 19'])
  })

  it('a spike with no usual to multiply is new traffic: the count and the source, never a multiplier', () => {
    const s = say(pin('spike', { day: '2026-09-19', n: { visitors: 230, referrer: 'news.example' } }), usd)
    expect(s.title).toBe('New traffic')
    expect(s.line).toBe('New traffic · 230 visitors · mostly from news.example')
    expect(s.big).toBe('230 visitors')
    expect(s.facts).toEqual(['mostly from news.example', 'Sat, Sep 19'])
    expect([s.line, s.big, ...s.facts].join(' ')).not.toMatch(/×|usual/)
  })

  it('a multiplier is rounded: a decimal only under ten', () => {
    expect(say(pin('spike', { n: { factor: 12.4, visitors: 900 } }), usd).line).toBe('Spike · 12× the usual')
    expect(say(pin('spike', { n: { factor: 3, visitors: 900 } }), usd).facts[0]).toBe('3× the usual')
  })

  it('sales: the amount, how many and who earned most', () => {
    const s = say(pin('sale', { day: '2026-09-02', n: { count: 3, amount: 132200, channel: 'AI' } }), usd)
    expect(s.line).toBe('3 sales · $1,322 · mostly AI assistants')
    expect(s.big).toBe('$1,322')
  })

  it('sales say what they were when they were all of one kind', () => {
    const one = say(pin('sale', { day: '2026-09-02', n: { count: 1, amount: 4900, channel: 'Search', what: 'new' } }), usd)
    expect(one.line).toBe('New customer · $49 · mostly Search')
    expect(one.facts[0]).toBe('New customer')
    const many = say(pin('sale', { day: '2026-09-02', n: { count: 3, amount: 14700, what: 'renewal' } }), usd)
    expect(many.line).toBe('3 renewals · $147')
    expect(many.facts[0]).toBe('3 renewals')
  })

  it('a page that lost buyers: the two rates, the page and since when', () => {
    const s = say(pin('drop', { day: '2026-09-12', filters: [{ dim: 'entry_page', value: '/pricing' }], n: { name: '/pricing', visitors: 1204, rate: 0.031, wasRate: 0.051 } }), usd)
    expect(s.line).toBe('/pricing converts 3.1%, was 5.1%')
    expect(s.big).toBe('5.1% → 3.1%')
    expect(s.facts).toEqual(['/pricing', '1,204 visitors', 'since Sep 12'])
  })

  it('a new referrer and the day it first sent anyone', () => {
    const s = say(pin('referrer', { day: '2026-09-13', filters: [{ dim: 'referrer', value: 'linkedin.com' }], n: { name: 'linkedin.com', visitors: 463 } }), usd)
    expect(s.line).toBe('New referrer: linkedin.com sent 463 visitors')
    expect(s.facts).toContain('first seen Sep 13')
  })

  it('a channel is called by its own name', () => {
    const s = say(pin('move', { filters: [{ dim: 'channel', value: 'AI' }], n: { name: 'AI', visitors: 900, was: 600, change: 0.5 } }), usd)
    expect(s.line).toBe('AI assistants up 50% · 600 → 900 visitors')
    expect(s.big).toBe('+50%')
  })

  it('a milestone reads as the milestones do', () => {
    const s = say(pin('milestone', { day: '2026-09-05', n: { family: 'visitors', value: 10000 } }), usd)
    expect(s.line).toBe('Milestone · 10,000 visitors')
  })
})

describe('what a mention says', () => {
  it('a spike a mention explains is told whole, with the hour', () => {
    const s = say(pin('spike', { day: '2026-10-14', at: '2026-10-14T14:00', n: { factor: 4.4, visitors: 300, referrer: 'news.ycombinator.com', mention: 'hn', brought: 212 } }), usd)
    expect(s.line).toBe('Visits jumped 340% at 14:00: posted on Hacker News, 212 visitors came from it.')
    expect(s.big).toBe('300 visitors')
  })

  it('by the day there is no hour to give', () => {
    const s = say(pin('spike', { day: '2026-10-14', at: '2026-10-14T00:00', n: { factor: 3, visitors: 300, mention: 'ph', brought: 1 } }), usd)
    expect(s.line).toBe('Visits jumped 200%: launched on Product Hunt, 1 visitor came from it.')
  })

  it('a spike without a mention reads as it did', () => {
    expect(say(pin('spike', { n: { factor: 4.2, visitors: 816 } }), usd).line).toBe('Spike · 4.2× the usual')
  })

  it('a mention of its own: where, and the people it brought', () => {
    const s = say(pin('mention', { day: '2026-10-14', n: { visitors: 40, name: 'X launch', mention: 'ph' } }), usd)
    expect(s.title).toBe('Mentioned')
    expect(s.line).toBe('Launched on Product Hunt: 40 visitors came from it')
    expect(s.facts).toEqual(['X launch', 'Wed, Oct 14'])
  })
})

describe('what an answer says', () => {
  it('tells a start, a stop and the first time in the words of Answers', () => {
    expect(say(pin('answer', { n: { name: 'openai', question: 'best analytics', did: 'seen' } }), usd)).toMatchObject({ title: 'Answers', line: 'ChatGPT started naming you for “best analytics”' })
    expect(say(pin('answer', { n: { name: 'anthropic', question: 'best analytics', did: 'dropped' } }), usd).line).toBe('Claude stopped naming you for “best analytics”')
    expect(say(pin('answer', { n: { name: 'openai', question: 'q', did: 'seen', first: true } }), usd).line).toBe('Peekaboo. ChatGPT just named you.')
  })
})
