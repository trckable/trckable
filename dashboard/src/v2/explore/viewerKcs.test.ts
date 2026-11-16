import { afterEach, describe, expect, it, vi } from 'vitest'
import * as me from '../../lib/me'
import { copy } from './copy'
import { viewerKcs } from './viewerKcs'
import type { Kc } from './types'

const kc = (icon: string, val: string, t = ''): Kc => ({ icon, label: icon, val, note: { c: '', t }, vals: [], st: '' })
const tiles = () => [kc('people', '12', copy.tooLittleBefore), kc('uptime', '–', 'checks off'), kc('leave', '–', 'as usual')]

describe('the Overview tiles on a shared link', () => {
  afterEach(() => vi.restoreAllMocks())

  it('drop Uptime and One page only when they have no figure, and the note that only says the history is short', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    const out = viewerKcs(tiles())
    expect(out.map((k) => k.icon)).toEqual(['people'])
    expect(out[0].note.t).toBe('')
  })
  it('keep Uptime and One page only once they have a figure', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    expect(viewerKcs([kc('uptime', '99.9%'), kc('leave', '41%')]).map((k) => k.icon)).toEqual(['uptime', 'leave'])
  })
  it('keep a real comparison note', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(true)
    expect(viewerKcs([kc('people', '12', '+4% vs usual')])[0].note.t).toBe('+4% vs usual')
  })
  it('are untouched for a signed-in view', () => {
    vi.spyOn(me, 'isShared').mockReturnValue(false)
    const all = tiles()
    expect(viewerKcs(all)).toEqual(all)
  })
})
