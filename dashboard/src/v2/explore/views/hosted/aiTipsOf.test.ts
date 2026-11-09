import { describe, expect, it } from 'vitest'
import type { AiSearchReport } from '../../../../lib/apiMore'
import { lowReturn, returnPer, tipsOf } from './aiTipsOf'

const base: AiSearchReport = { visitors: 0, assistants: [], referrers: [], crawled: 0, humans: 0, per_visitor: 0, companies: [], bots: [], pages: [], google: false }
const rep = (o: Partial<AiSearchReport>): AiSearchReport => ({ ...base, ...o })
const ids = (r: AiSearchReport, can = true) => tipsOf(r, can).map((t) => t.id)

describe('returnPer', () => {
  it('divides fetches by visitors', () => {
    expect(returnPer(238_000, 2591)).toEqual({ kind: 'per', n: 92 })
    expect(returnPer(68_000, 58)).toEqual({ kind: 'per', n: 1172 })
  })
  it('says nobody when it read and sent no one', () => expect(returnPer(900, 0)).toEqual({ kind: 'nobody' }))
  it('has nothing to say without fetches', () => {
    expect(returnPer(0, 5)).toEqual({ kind: 'none' })
    expect(returnPer(undefined, 5)).toEqual({ kind: 'none' })
    expect(returnPer(0, 0)).toEqual({ kind: 'none' })
  })
  it('never says fewer than one fetch', () => expect(returnPer(2, 5)).toEqual({ kind: 'per', n: 1 }))
  it('calls out only a big reader that credits little', () => {
    expect(lowReturn(returnPer(68_000, 58), 68_000)).toBe(true)
    expect(lowReturn(returnPer(238_000, 2591), 238_000)).toBe(false)
    expect(lowReturn(returnPer(400, 0), 400)).toBe(false) // too few fetches to mean anything
    expect(lowReturn(returnPer(900, 0), 900)).toBe(true)
  })
})

describe('tipsOf', () => {
  it('asks to connect when there is no crawler data, and says nothing to someone who cannot', () => {
    expect(ids(rep({}))).toEqual(['connect'])
    expect(ids(rep({}), false)).toEqual([])
  })
  it('stays quiet when the numbers show nothing', () => {
    expect(ids(rep({ bots: [{ name: 'OpenAI', kind: 'answer', hits: 1000, errors: 2, blocked: 0 }] }))).toEqual([])
  })
  it('broken pages: needs enough of them and a real share of the requests', () => {
    const bot = (errors: number, hits: number) => rep({ bots: [{ name: 'OpenAI', kind: 'answer', hits, errors }], pages: [{ path: '/old', read: 5, sent: 0, errors }] })
    expect(ids(bot(19, 100))).toEqual([])
    expect(ids(bot(30, 10_000))).toEqual([]) // 0.3%
    const t = tipsOf(bot(30, 100), true)[0]
    expect(t).toEqual({ id: 'broken', company: 'OpenAI', errors: 30, pages: [{ path: '/old', n: 30 }] })
  })
  it('a search engine\'s broken pages are not AI\'s', () => {
    expect(ids(rep({ bots: [{ name: 'Google', kind: 'index', hits: 100, errors: 90 }] }))).toEqual([])
  })
  it('an assistant that reads a lot and sends nobody, with its most-read page', () => {
    const r = rep({
      bots: [{ name: 'Anthropic', kind: 'train', hits: 68_000 }],
      assistants: [{ name: 'Claude', visitors: 58, company: 'Anthropic', fetches: 68_000 }, { name: 'ChatGPT', visitors: 2591, company: 'OpenAI', fetches: 238_000 }],
      pages: [{ path: '/blog', read: 10, sent: 0, bots: [{ name: 'Anthropic', kind: 'train', hits: 5 }] }, { path: '/pricing', read: 90, sent: 0, bots: [{ name: 'Anthropic', kind: 'train', hits: 60 }] }],
    })
    expect(tipsOf(r, true)).toEqual([{ id: 'credit', assistant: 'Claude', fetches: 68_000, visitors: 58, page: '/pricing' }])
  })
  it('an assistant that reads little, or sends a fair share, is not called out', () => {
    const a = (visitors: number, fetches: number) => rep({ bots: [{ name: 'OpenAI', kind: 'answer', hits: fetches }], assistants: [{ name: 'ChatGPT', visitors, company: 'OpenAI', fetches }] })
    expect(ids(a(0, 499))).toEqual([])
    expect(ids(a(10, 1000))).toEqual([])
    expect(ids(a(2, 1000))).toEqual(['credit'])
  })
  it('an assistant with no robot of its own has no fetches to judge', () => {
    expect(ids(rep({ bots: [{ name: 'OpenAI', kind: 'answer', hits: 1 }], assistants: [{ name: 'DeepSeek', visitors: 4 }] }))).toEqual([])
  })
  it('requests the server turned away, once enough', () => {
    const r = (blocked: number) => rep({ bots: [{ name: 'OpenAI', kind: 'answer', hits: 500, blocked }, { name: 'Anthropic', kind: 'train', hits: 500, blocked: 5 }] })
    expect(ids(r(10))).toEqual([]) // 15 together
    expect(tipsOf(r(40), true)).toEqual([{ id: 'blocked', blocked: 45, companies: ['OpenAI', 'Anthropic'] }])
  })
  it('pages Google ranks that AI never read', () => {
    const r = rep({ bots: [{ name: 'OpenAI', kind: 'answer', hits: 5 }], pages: [{ path: '/a', read: 0, sent: 0, flag: 'unread' }, { path: '/b', read: 4, sent: 0 }, { path: '/c', read: 0, sent: 0, flag: 'unread' }] })
    expect(tipsOf(r, true)).toEqual([{ id: 'unread', count: 2, pages: ['/a', '/c'] }])
  })
  it('gives three at most, the most useful first', () => {
    const r = rep({
      bots: [{ name: 'OpenAI', kind: 'answer', hits: 100, errors: 50, blocked: 50 }],
      assistants: [{ name: 'ChatGPT', visitors: 0, company: 'OpenAI', fetches: 2000 }],
      pages: [{ path: '/x', read: 0, sent: 0, flag: 'unread' }],
    })
    expect(ids(r)).toEqual(['broken', 'credit', 'blocked'])
  })
})
