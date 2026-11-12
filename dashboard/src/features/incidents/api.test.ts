import { afterEach, describe, expect, it, vi } from 'vitest'

const call = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('../../lib/api', () => ({ call: (...a: unknown[]) => call(...a) }))

afterEach(() => {
  call.mockReset()
  vi.useRealTimers()
  vi.resetModules()
})

describe('incidents.period', () => {
  it('shares one read between screens that ask for the same period at once, and reads again later', async () => {
    vi.useFakeTimers()
    const { incidents, PERIOD_SHARE_MS } = await import('./api')
    call.mockResolvedValue({ incidents: [], summary: {} })
    const a = incidents.period('s1', 10, 20)
    const b = incidents.period('s1', 10, 20)
    expect(b).toBe(a)
    expect(call).toHaveBeenCalledTimes(1)
    void incidents.period('s1', 10, 30)
    expect(call).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(PERIOD_SHARE_MS)
    void incidents.period('s1', 10, 20)
    expect(call).toHaveBeenCalledTimes(3)
  })

  it('asks again right after a failed read', async () => {
    const { incidents } = await import('./api')
    call.mockRejectedValueOnce(new Error('down')).mockResolvedValue({ incidents: [], summary: {} })
    await expect(incidents.period('s1', 1, 2)).rejects.toThrow()
    await incidents.period('s1', 1, 2)
    expect(call).toHaveBeenCalledTimes(2)
  })
})
