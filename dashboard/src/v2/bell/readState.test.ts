import { afterEach, describe, expect, it, vi } from 'vitest'
import { more } from '../../lib/apiMore'
import { syncRead, unsent } from './readState'

afterEach(() => vi.restoreAllMocks())

describe('read state', () => {
  it('finds what only this browser has read', () => {
    expect(unsent(new Set(['a', 'b', 'c']), ['b'])).toEqual(['a', 'c'])
  })

  it('joins the account list with the local one and sends the local extras up', async () => {
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: ['x', 'y'] })
    const post = vi.spyOn(more, 'markBellRead').mockResolvedValue({ read: [] })
    const all = await syncRead(new Set(['y', 'z']))
    expect([...(all ?? [])].sort()).toEqual(['x', 'y', 'z'])
    expect(post).toHaveBeenCalledWith(['z'])
  })

  it('falls back to the local list when the server cannot be reached', async () => {
    vi.spyOn(more, 'bellRead').mockRejectedValue(new Error('offline'))
    expect(await syncRead(new Set(['a']))).toBeNull()
  })
})
