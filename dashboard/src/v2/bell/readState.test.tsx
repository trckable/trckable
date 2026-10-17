// @vitest-environment happy-dom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { more } from '../../lib/apiMore'
import { KEY, syncRead, unsent, useReadSet } from './readState'

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

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount() {
  const out: { current: ReturnType<typeof useReadSet> | null } = { current: null }
  const Probe = () => {
    out.current = useReadSet(true)
    return null
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => root.render(<StrictMode><Probe /></StrictMode>))
  return { out, stop: () => act(() => root.unmount()) }
}

describe('the read set a bell shows', () => {
  afterEach(() => localStorage.clear())

  it('keeps what was read while the server was still answering, and tells the server once', async () => {
    let answer: (v: { read: string[] }) => void = () => undefined
    vi.spyOn(more, 'bellRead').mockReturnValue(new Promise((r) => (answer = r)))
    const post = vi.spyOn(more, 'markBellRead').mockResolvedValue({ read: [] })
    const { out, stop } = mount()
    act(() => out.current?.mark(['x']))
    expect(out.current?.read.has('x')).toBe(true)
    answer({ read: ['y'] })
    await act(() => Promise.resolve())
    expect(out.current?.read.has('x')).toBe(true)
    expect(out.current?.read.has('y')).toBe(true)
    expect(post.mock.calls.filter((c) => c[0].includes('x'))).toHaveLength(1)
    stop()
  })

  it('follows another tab through the storage event', async () => {
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    vi.spyOn(more, 'markBellRead').mockResolvedValue({ read: [] })
    const { out, stop } = mount()
    await act(() => Promise.resolve())
    localStorage.setItem(KEY, JSON.stringify(['z']))
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: KEY })))
    expect(out.current?.read.has('z')).toBe(true)
    stop()
  })
})
