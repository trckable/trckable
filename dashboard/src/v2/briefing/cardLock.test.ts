import { describe, expect, it } from 'vitest'
import type { Story } from './cards'
import { idOf, locked } from './useCardLock'

const s = (key: Story['key'], score: number): Story => ({ key, score, head: key, vis: null, why: '', val: '', m: 0, u: '', how: '', ev: '', deeper: { kind: 'speed' } })

describe('the card order is kept while you read', () => {
  it('keeps the order it opened with and queues what is new', () => {
    const first = [s('sources', 80), s('devices', 50)]
    const order = idOf(first)
    const later = [s('speed', 90), s('devices', 95), s('sources', 60)]
    const { known, queued } = locked(later, order)
    expect(known.map((x) => x.key)).toEqual(['sources', 'devices'])
    expect(queued.map((x) => x.key)).toEqual(['speed'])
  })
  it('tells two cards of one topic apart', () => {
    expect(idOf([s('sales', 1), s('sales', 2), s('pages', 3)])).toEqual(['sales#0', 'sales#1', 'pages#0'])
  })
})
