// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Notice } from './notices'
import { Bell } from './Bell'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const n = (id: string, dismissable: boolean): Notice => ({ id, kind: 'plan', site: '', title: id, sub: 'sub', at: 1, dismissable })

describe('a build’s own list in the bell', () => {
  it('can put a notice away, and shows the archive as a second view', () => {
    const dismiss = vi.fn()
    const load = vi.fn()
    const notices = {
      items: [n('keep', false), n('away', true)],
      read: new Set<string>(),
      refresh: vi.fn(),
      mark: () => undefined,
      markAll: () => undefined,
      can: true,
      ready: true,
      dismiss,
      archive: { items: [n('old one', false)], load, loading: false, words: { dismiss: 'Put away', archive: 'Archive', fresh: 'New', none: 'Nothing here' } },
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Bell site={null} notices={notices} />))
    act(() => host.querySelector<HTMLButtonElement>('#bellBtn')?.click())
    const x = [...host.querySelectorAll<HTMLButtonElement>('.nfx')]
    expect(x).toHaveLength(1) // only the one that may be put away
    act(() => x[0].click())
    expect(dismiss).toHaveBeenCalledWith('away')
    const tab = [...host.querySelectorAll<HTMLButtonElement>('.nff .lk3')].find((b) => b.textContent === 'Archive')
    act(() => tab?.click())
    expect(load).toHaveBeenCalled()
    expect(host.textContent).toContain('old one')
    expect(host.querySelectorAll('.nfx')).toHaveLength(0)
    act(() => root.unmount())
    host.remove()
  })
})
