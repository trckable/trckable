import { beforeEach, describe, expect, it, vi } from 'vitest'

const setupFunnel = vi.fn<(site: string) => Promise<object>>(() => Promise.resolve({}))
let owner = true
vi.mock('../../lib/apiMore', () => ({ more: { setupFunnel: (s: string) => setupFunnel(s) } }))
vi.mock('../../lib/permissions', () => ({ can: () => owner }))

const load = async () => (await import('./funnelBuilt')).funnelBuilt

describe('a funnel the owner built', () => {
  beforeEach(() => {
    setupFunnel.mockClear()
    owner = true
    vi.resetModules()
  })
  it('is told once per site', async () => {
    const funnelBuilt = await load()
    funnelBuilt('s1', 3)
    funnelBuilt('s1', 3)
    funnelBuilt('s2', 2)
    expect(setupFunnel.mock.calls).toEqual([['s1'], ['s2']])
  })
  it('is not one when the steps are only suggested, or fewer than two', async () => {
    const funnelBuilt = await load()
    funnelBuilt('s1', 0)
    funnelBuilt('s1', 1)
    expect(setupFunnel).not.toHaveBeenCalled()
  })
  it('is not told by a viewer', async () => {
    owner = false
    const funnelBuilt = await load()
    funnelBuilt('s1', 3)
    expect(setupFunnel).not.toHaveBeenCalled()
  })
})
