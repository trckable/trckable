// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

// The heatmaps script reads the same tag as the base script and derives where
// its reports go from the events address: data-api="/s/e" gives /s/h, the
// default gives /api/h on the script's own host.
const heat = vi.fn()
vi.mock('../src/heatmap', () => ({ heat }))

async function load(dataset: Record<string, string>, src: string) {
  heat.mockClear()
  vi.resetModules()
  Object.defineProperty(document, 'currentScript', { value: { dataset, src }, configurable: true })
  await import('../src/heat')
  return heat.mock.calls[0]![0] as { api: string; site: string }
}

afterEach(() => Reflect.deleteProperty(document, 'currentScript'))

describe('heatmaps script address', () => {
  it('follows a first-party events address', async () => {
    expect((await load({ site: 'tkb_a', api: '/s/e' }, 'https://x.com/s/x.js')).api).toBe('/s/h')
  })

  it('follows a full events address', async () => {
    expect((await load({ site: 'tkb_a', api: 'https://x.com/s/e' }, 'https://x.com/s/x.js')).api).toBe('https://x.com/s/h')
  })

  it('defaults to /api/h on the host the script came from', async () => {
    expect((await load({ site: 'tkb_a' }, 'https://stats.example.com/js/tkb_a.js')).api).toBe('https://stats.example.com/api/h')
  })

  it('follows /api/e given as data-api', async () => {
    expect((await load({ site: 'tkb_a', api: '/api/e' }, 'https://x.com/js/t.js')).api).toBe('/api/h')
  })
})
