import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  return import('./stale')
}

describe('a chunk that is gone', () => {
  it("is told from other errors in every browser's words", async () => {
    const { staleChunk } = await load()
    expect(staleChunk(new TypeError('Failed to fetch dynamically imported module: https://x.example/assets/Account-137721bf.js'))).toBe(true)
    expect(staleChunk(new TypeError('error loading dynamically imported module: https://x.example/assets/a.js'))).toBe(true)
    expect(staleChunk(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(staleChunk(new Error('Unable to preload CSS for /assets/Vitals-eb73bf51.css'))).toBe(true)
    expect(staleChunk(new TypeError("Cannot read properties of undefined (reading 'slice')"))).toBe(false)
    expect(staleChunk(undefined)).toBe(false)
    expect(staleChunk('Failed to fetch dynamically imported module')).toBe(true)
  })
})

describe('the one reload', () => {
  let store: Record<string, string>
  let reload: ReturnType<typeof vi.fn>
  let served: string
  beforeEach(() => {
    store = {}
    reload = vi.fn()
    served = '<script type="module" src="/assets/react-cccc3333.js"></script><script type="module" src="/assets/index-bbbb2222.js"></script>' // the build the server runs now (the same React, another app)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) })
    vi.stubGlobal('location', { reload })
    vi.stubGlobal('document', { querySelectorAll: () => [{ getAttribute: () => '/assets/react-cccc3333.js' }, { getAttribute: () => '/assets/index-aaaa1111.js' }] }) // the build this page runs
    vi.stubGlobal('fetch', () => Promise.resolve({ text: () => Promise.resolve(served) }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('happens once when the server runs another build, and says so while it is under way', async () => {
    const { reloadOnce } = await load()
    expect(await reloadOnce()).toBe(true)
    expect(await reloadOnce()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('does not happen when the server runs the same build: a download aborted by leaving the page proves nothing', async () => {
    served = '<script type="module" src="/assets/react-cccc3333.js"></script><script type="module" src="/assets/index-aaaa1111.js"></script>'
    const { reloadOnce } = await load()
    expect(await reloadOnce()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    served = '<script type="module" src="/assets/react-cccc3333.js"></script><script type="module" src="/assets/index-bbbb2222.js"></script>' // a deploy lands later
    expect(await reloadOnce()).toBe(true)
  })
  it('does not happen when the server cannot be asked', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('NetworkError')))
    const { reloadOnce } = await load()
    expect(await reloadOnce()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
  it('never happens twice within a minute: a page that fails again after its reload stays put', async () => {
    store['trckable:reloaded'] = String(Date.now() - 20_000)
    const { reloadOnce } = await load()
    expect(await reloadOnce()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
  it('may happen again after a minute', async () => {
    store['trckable:reloaded'] = String(Date.now() - 61_000)
    const { reloadOnce } = await load()
    expect(await reloadOnce()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('does not happen where it cannot be told from a loop (storage blocked)', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
    })
    const { reloadOnce } = await load()
    expect(await reloadOnce()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
