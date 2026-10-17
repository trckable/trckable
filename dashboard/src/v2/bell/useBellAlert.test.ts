import { describe, expect, it } from 'vitest'
import { arrivals, soundDue, SOUND_GAP_MS } from './useBellAlert'
import type { Notice } from './notices'

const n = (id: string, seen = false): Notice => ({ id, kind: 'plan', site: '', title: id, sub: '', at: 1, seen })

describe('what is new to the bell', () => {
  it('is nothing the first time a list is read', () => {
    expect(arrivals(null, [n('a')], new Set())).toBeNull()
  })

  it('is only the unread ones not seen before: a read one, one read where it comes from and a known one do not chime', () => {
    const fresh = arrivals(new Set(['known']), [n('known'), n('read'), n('seen', true), n('new')], new Set(['read']))
    expect(fresh?.map((x) => x.id)).toEqual(['new'])
  })

  it('chimes once however many arrive: a second sound waits out the gap', () => {
    expect(soundDue(-Infinity, 1000)).toBe(true)
    expect(soundDue(1000, 1000 + SOUND_GAP_MS - 1)).toBe(false)
    expect(soundDue(1000, 1000 + SOUND_GAP_MS)).toBe(true)
  })
})
