import { beforeEach, describe, expect, it, vi } from 'vitest'

const asked = vi.fn()
vi.mock('../../lib/api', () => ({
  cachedReport: (site: string, q: unknown) => {
    asked(site, q)
    return Promise.resolve({ current: { dims: { country: [{ value: 'AT', visitors: 3 }, { value: 'DE', visitors: 9 }] }, goals: [{ value: 'signup', visitors: 2 }] } })
  },
}))

import { siblingRows } from './filterOps'

beforeEach(() => asked.mockClear())

describe('the values a filtered dimension can still offer', () => {
  it('come from the page without that dimension\'s own filters, and keep the others', async () => {
    const q = { from: 'a', to: 'b', compare: 'previous' as const, daily: true, filters: [{ dim: 'country', value: 'DE' }, { dim: 'device', op: 'not' as const, value: 'Mobile' }] }
    const rows = await siblingRows('s1', q)('country')
    expect(rows.map((r) => r.value)).toEqual(['AT', 'DE'])
    expect(asked).toHaveBeenCalledWith('s1', { ...q, compare: undefined, daily: false, filters: [{ dim: 'device', op: 'not', value: 'Mobile' }] })
  })
  it('read goals from their own list', async () => {
    const rows = await siblingRows('s1', { from: 'a', to: 'b' })('goal')
    expect(rows.map((r) => r.value)).toEqual(['signup'])
  })
})
