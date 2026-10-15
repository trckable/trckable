import { describe, expect, it } from 'vitest'
import { aboutTile } from './aboutTile'
import type { Tile } from './rules'

const tile: Tile = { key: 'visitors', label: 'Visitors', value: '1,204', tone: 'good', verdict: 'Busier than usual', move: { change: 0.12, pct: 12, arrow: '↑', tone: 'good' } }

describe('aboutTile', () => {
  it('says the number, how it moved and the verdict', () => {
    expect(aboutTile(tile)).toEqual({ title: 'Visitors', facts: ['Visitors: 1,204', 'Up 12% on the period before', 'Busier than usual'], question: 'Why is visitors where it is, and what moved it?' })
  })

  it('leaves out a move that is flat or unknown', () => {
    expect(aboutTile({ ...tile, move: { change: 0, pct: 0, arrow: '→', tone: 'flat' } }).facts).toEqual(['Visitors: 1,204', 'Busier than usual'])
    expect(aboutTile({ ...tile, move: undefined, verdict: '' }).facts).toEqual(['Visitors: 1,204'])
  })
})
