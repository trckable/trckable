import { describe, expect, it } from 'vitest'
import type { Row } from '../types'
import { insightOf } from './insight'

const row = (name: string, v: number, c: number, st: Row['st']): Row => ({ val: name, name, v, c, st })

describe('insightOf', () => {
  it('names the biggest move', () => expect(insightOf([row('/a', 49, 70, 'dn'), row('/docs', 28, 56, 'dn')])).toBe('/docs fell 50%, from 56 to 28 people.'))
  it('says nothing about small numbers', () => expect(insightOf([row('Albania', 2, 7, 'dn')])).toBeNull())
  it('says nothing when nothing moved', () => expect(insightOf([row('/a', 49, 50, '')])).toBeNull())
  it('names a page that is new', () => expect(insightOf([row('/new', 12, 0, 'up')])).toBe('/new is new, with 12 people.'))
})

describe('long addresses', () => {
  it('keeps the start and the end of a long path', () => {
    const name = '/news/buxheti-per-arsimin-parauniversitar-kumbaro-nga-viti-i-ardhshem-1-mesues-ndihmes'
    const line = insightOf([row(name, 237, 0, 'up')]) ?? ''
    expect(line).toContain('…')
    expect(line).toContain('/news/buxheti')
    expect(line.length).toBeLessThan(90)
  })
})
