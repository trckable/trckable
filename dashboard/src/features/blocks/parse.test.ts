import { describe, expect, it } from 'vitest'
import { parseBlocks } from './parse'
import { KINDS } from './types'

describe('parseBlocks', () => {
  it('keeps a block that fits and leaves out one that does not', () => {
    const r = parseBlocks({
      blocks: [
        { type: 'number', title: 'Visitors', period: { from: 'a', to: 'b', label: 'This week' }, data: { unit: 'count', value: 12, previous: 10 } },
        { type: 'number', title: 'Broken', data: { value: 'twelve' } },
        { type: 'nope', data: {} },
        { type: 'line', title: 'One point', data: { points: [1] } },
      ],
    })
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0]).toMatchObject({ type: 'number', data: { value: 12, previous: 10 } })
  })

  it('passes on what the answer says is missing, and draws nothing from a reply that is not blocks', () => {
    expect(parseBlocks({ blocks: [], missing: 'Mentions are off for this site.' })).toEqual({ blocks: [], missing: 'Mentions are off for this site.' })
    expect(parseBlocks('x')).toEqual({ blocks: [] })
    expect(parseBlocks(null)).toEqual({ blocks: [] })
  })

  it('reads every kind', () => {
    const r = parseBlocks({
      blocks: [
        { type: 'line', title: 'L', data: { points: [1, 2], labels: ['a', 'b'] } },
        { type: 'ranked', title: 'R', data: { unit: 'money', currency: 'EUR', rows: [{ label: 'x', value: 5 }, { label: 'bad' }] } },
        { type: 'incidents', title: 'I', data: { uptime: 99.1, incidents: [{ id: 'i', kind: 'down', started_at: 5, ended_at: null, cause: 'c' }, { kind: 'weird', started_at: 1 }] } },
        { type: 'mentions', title: 'M', data: { mentions: [{ id: 1, source: 'hn', url: 'u', title: 't', posted_at: 1 }, { id: 2, source: 'x', posted_at: 1 }] } },
        { type: 'compare', title: 'C', data: { current: { label: 'a', value: 2 }, previous: { label: 'b', value: 1 } } },
      ],
    })
    expect(r.blocks.map((b) => b.type)).toEqual(['line', 'ranked', 'incidents', 'mentions', 'compare'])
    expect(r.blocks.map((b) => b.type)).toEqual([...KINDS].filter((k) => k !== 'number'))
    expect(r.blocks[1]).toMatchObject({ data: { unit: 'money', currency: 'EUR', rows: [{ label: 'x', value: 5 }] } })
    expect(r.blocks[2]).toMatchObject({ data: { incidents: [{ id: 'i' }] } })
    expect(r.blocks[3]).toMatchObject({ data: { mentions: [{ id: 1 }] } })
  })
})
