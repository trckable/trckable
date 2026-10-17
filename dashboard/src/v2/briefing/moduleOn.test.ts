import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { moduleOn } from './moduleOn'

afterEach(() => vi.restoreAllMocks())

describe('whether a module is on', () => {
  it('says no for a module that is off, and asks once for the list', async () => {
    const ask = vi.spyOn(api, 'modules').mockResolvedValue({ modules: [{ id: 'vitals', enabled: false }, { id: 'search', enabled: true }] as never, script: {} as never })
    expect(await moduleOn('a', 'vitals')).toBe(false)
    expect(await moduleOn('a', 'search')).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('asks as before when the list cannot be read', async () => {
    vi.spyOn(api, 'modules').mockRejectedValue(new Error('no'))
    expect(await moduleOn('b', 'vitals')).toBe(true)
  })
})
