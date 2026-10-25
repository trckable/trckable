// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setRole } from '../../lib/me'
import { useGate } from './Gate'
import { clearSkipped, markSkipped } from './skipped'

vi.mock('../../lib/url', () => ({ navigate: vi.fn() }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type G = ReturnType<typeof useGate>
function mount(who: string): { get: () => G } {
  let cur: G | undefined
  const Probe = () => {
    cur = useGate([], false, '/', who)
    return null
  }
  act(() => createRoot(document.createElement('div')).render(<Probe />))
  return { get: () => cur as G }
}

describe('useGate', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSkipped('a@x.com')
    clearSkipped('b@x.com')
    setRole('owner')
  })
  it('holds an owner with no site', () => expect(mount('a@x.com').get().gated).toBe(true))
  it('lets the owner through after a skip with no site, and stays through a reload', () => {
    const first = mount('a@x.com')
    act(() => first.get().pass(true))
    expect(first.get().gated).toBe(false)
    expect(mount('a@x.com').get().gated).toBe(false)
  })
  it('a second account in the same browser still gets its first run', () => {
    markSkipped('a@x.com')
    expect(mount('b@x.com').get().gated).toBe(true)
  })
  it('reopen brings the first run back', () => {
    markSkipped('a@x.com')
    const g = mount('a@x.com')
    expect(g.get().gated).toBe(false)
    act(() => g.get().reopen())
    expect(g.get().gated).toBe(true)
  })
  it('never holds a viewer', () => {
    setRole('viewer')
    expect(mount('v@x.com').get().gated).toBe(false)
  })
})
