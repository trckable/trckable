import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
vi.mock('../../lib/api', async (orig) => ({ ...(await orig<typeof import('../../lib/api')>()), call: (_m: string, url: string) => (calls.push(url), Promise.resolve({ moments: [] })) }))

import { momentsApi } from './api'

describe('the moments the chart asks for', () => {
  beforeEach(() => void (calls.length = 0))

  it('are never narrowed by a filter: a marker says the same number whatever the page is filtered to', async () => {
    await momentsApi.moments('s1', { from: '2026-09-01', to: '2026-09-30', filters: [{ dim: 'referrer', value: 'google.com' }] }, 'day')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/moments?')
    expect(calls[0]).not.toMatch(/[?&]f=/)
  })
})
