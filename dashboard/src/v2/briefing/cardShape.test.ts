import { describe, expect, it } from 'vitest'
import type { Story } from './cards'
import { sentence, shapeOf, usualBadge } from './cardShape'

const story = (o: Partial<Story>): Story => ({ key: 'sources', score: 1, head: 'Hacker News sent 186 people', rest: ', 21× your usual', vis: null, why: '', val: '186', m: 186, u: 'people', how: '', ev: '', deeper: { kind: 'all' }, ...o })

describe('the badge says how far from usual', () => {
  it('uses times from one and a half, percent below that, red for a drop, and nothing at the usual', () => {
    expect(usualBadge(19)).toEqual({ text: '↑ 19× usual', tone: 'up' })
    expect(usualBadge(1.3)).toEqual({ text: '↑ 30% above usual', tone: 'up' })
    expect(usualBadge(0.4)).toEqual({ text: '↓ 60% below usual', tone: 'dn' })
    expect(usualBadge(1.02)).toBeNull()
  })
})

describe('the shell takes its picture and link from the card', () => {
  it.each([
    [{ vis: { k: 'spike' } }, 'spike'],
    [{ vis: { k: 'journey', steps: [] } }, 'journey'],
    [{ vis: { k: 'ba', lo: 1, hi: 2, c: 1, v: 3, red: false } }, 'band'],
    [{ vis: { k: 'goals', rows: [] } }, 'goals'],
    [{ vis: { k: 'funnel', rows: [] } }, 'steps'],
    [{ vis: { k: 'rcpt', rows: [] }, key: 'mentions' }, 'rows'],
    [{ vis: { k: 'rcpt', rows: [] }, key: 'sales' }, 'money'],
    [{ vis: null }, 'none'],
  ] as [Partial<Story>, string][])('%j is the %s picture', (o, pic) => {
    expect(shapeOf(story(o)).pic).toBe(pic)
  })
  it('names a country by its flag, shows the ratio as the badge and links to who', () => {
    const sh = shapeOf(story({ key: 'countries', kc: { flag: '🇦🇱', label: 'Albania' }, ratio: 19 }))
    expect(sh).toMatchObject({ subject: '🇦🇱 Albania', badge: { text: '↑ 19× usual', tone: 'up' }, link: 'See who' })
  })
  it('puts the figure in the corner of a card that has no usual, red when it is bad news, and none for the sales', () => {
    expect(shapeOf(story({ key: 'speed', bad: true, val: '3.1 s' })).badge).toEqual({ text: '3.1 s', tone: 'dn' })
    expect(shapeOf(story({ key: 'sales', val: '$338' })).badge).toBeNull()
    expect(shapeOf(story({ key: 'countries', mark: 'first customer' })).badge).toEqual({ text: 'first customer', tone: 'up' })
  })
  it('gives the sales their own link, the goals theirs, the incident none', () => {
    expect(shapeOf(story({ key: 'sales' })).link).toBe('Where they came from')
    expect(shapeOf(story({ key: 'goals' })).link).toBe('What drove it')
    expect(shapeOf(story({ key: 'uptime' })).link).toBeNull()
    expect(shapeOf(story({ key: 'search' })).link).toBe('Go deeper')
  })
})

describe('the sentence lights one figure', () => {
  it('lights the card\'s own number where it is in the words, and none in the sales words (the picture has it)', () => {
    expect(sentence(story({ key: 'sales', vis: { k: 'rcpt', rows: [] }, head: '1 new customer, 1 renewal', rest: '', val: '$338' })).figure).toBe('')
    expect(sentence(story({ key: 'sources', head: 'Hacker News sent 186 people', rest: '', val: '186' })).figure).toBe('186')
  })
  it('falls back to the first figure, and takes the flag out', () => {
    expect(sentence(story({ key: 'countries', head: '🇦🇱 115 people from Albania', rest: ', more than usual', val: '115' }))).toEqual({ before: '', figure: '115', after: ' people from Albania, more than usual' })
    expect(sentence(story({ key: 'goals', head: 'Signup up 1700%', rest: undefined, val: '214' })).figure).toBe('1700%')
    expect(sentence(story({ head: 'Pages got slower', rest: '', val: '3 s' })).figure).toBe('')
  })
})
