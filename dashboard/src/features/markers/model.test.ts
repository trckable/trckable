import { describe, expect, it } from 'vitest'
import { biggest, cluster, jumpDays, linkJumps, place, sourceJumps, type Jump } from './model'

const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
const jump = (o: Partial<Jump>): Jump => ({ kind: 'source', id: 'hn', name: 'Hacker News', badge: 'HN', day: '2026-10-02', visitors: 40, added: 40, first: true, filter: { dim: 'referrer', value: 'news.ycombinator.com' }, ...o })

describe('jumpDays', () => {
  it('marks the first visits of a source that was silent', () => {
    expect(jumpDays(days(4), [0, 0, 40, 3])).toEqual([{ day: '2026-10-03', visitors: 40, added: 40, first: true }])
  })
  it('marks a jump over the week before, and says only what it added', () => {
    expect(jumpDays(days(5), [10, 10, 10, 10, 60])).toEqual([{ day: '2026-10-05', visitors: 60, added: 50, first: false }])
  })
  it('ignores steady traffic and small numbers', () => {
    expect(jumpDays(days(6), [30, 32, 28, 35, 31, 40])).toEqual([])
    expect(jumpDays(days(4), [0, 0, 3, 0])).toEqual([])
  })
  it('keeps the day after a jump from marking again while it is still high', () => {
    expect(jumpDays(days(5), [0, 0, 50, 55, 60]).map((j) => j.day)).toEqual(['2026-10-03'])
  })
  it('keeps the three biggest days of one source', () => {
    const v = [0, 0, 10, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 40]
    expect(jumpDays(days(26), v).map((j) => j.added)).toEqual([40, 30, 19])
  })
})

describe('sourceJumps', () => {
  it('adds the hosts of one source and filters to the one that sent most', () => {
    const d = days(4)
    const out = sourceJumps(d, { 'x.com': [0, 0, 5, 0], 't.co': [0, 0, 20, 0], 'twitter.com': [0, 0, 0, 0] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'x', name: 'X', visitors: 25, added: 25, filter: { dim: 'referrer', value: 't.co' } })
  })
  it('says nothing for a source with no jump', () => {
    expect(sourceJumps(days(4), { 'google.com': [20, 22, 19, 21] })).toEqual([])
  })
})

describe('linkJumps', () => {
  it('names a link by its own filter, over the last days of its small chart', () => {
    const some = linkJumps(days(4), [{ dim: 'source', value: 'newsletter', spark: [0, 0, 12, 0] }], (v) => v)
    expect(some[0]).toMatchObject({ kind: 'link', name: 'newsletter', day: '2026-10-03', filter: { dim: 'source', value: 'newsletter' } })
  })
})

describe('place and cluster', () => {
  const labels = days(10)
  const x = (i: number) => i * 40
  it('puts a jump on the bucket that holds its day, and drops one the chart does not show', () => {
    expect(place([jump({}), jump({ day: '2026-11-02' })], labels, 'day').map((p) => p.i)).toEqual([1])
  })
  it('joins markers that would touch into the biggest one', () => {
    const placed = place([jump({ day: '2026-10-02', added: 10 }), jump({ day: '2026-10-03', added: 40, id: 'ph' }), jump({ day: '2026-10-08', added: 7, id: 'x' })], labels, 'day')
    const marks = cluster(placed, x, [0, 400])
    expect(marks.map((m) => [m.jump.id, m.more.length])).toEqual([['ph', 1], ['x', 0]])
  })
  it('shows at most six', () => {
    const many = Array.from({ length: 9 }, (_, i) => jump({ day: `2026-10-0${i + 1}`, added: 10 + i }))
    expect(cluster(place(many, labels, 'day'), (i) => i * 100, [0, 2000])).toHaveLength(6)
  })
})

describe('biggest', () => {
  const labels = days(7)
  it('names the source behind most of the rise', () => {
    expect(biggest([jump({ added: 40 })], labels, [10, 55, 10, 12, 8, 10, 9])?.id).toBe('hn')
  })
  it('says nothing when the source is a small part of the rise', () => {
    expect(biggest([jump({ added: 6 })], labels, [10, 55, 10, 12, 8, 10, 9])).toBeUndefined()
  })
  it('says nothing without a jump or on a day that is not a rise', () => {
    expect(biggest([], labels, [1, 2, 3, 4, 5, 6, 7])).toBeUndefined()
    expect(biggest([jump({ added: 40 })], labels, [60, 5, 5, 5, 5, 5, 5])).toBeUndefined()
  })
})
