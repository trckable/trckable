import { describe, expect, it } from 'vitest'
import type { Annotation } from '../../lib/api'
import { byDay } from './NotesList'

const note = (id: string, day: string) => ({ id, day, text: id }) as Annotation

describe('byDay', () => {
  it('puts every note of one day under one heading, in the order given', () => {
    const got = byDay([note('a', '2026-09-27'), note('b', '2026-09-13'), note('c', '2026-09-13')])
    expect(got.map(([d, ns]) => [d, ns.map((n) => n.id)])).toEqual([
      ['2026-09-27', ['a']],
      ['2026-09-13', ['b', 'c']],
    ])
  })
})
