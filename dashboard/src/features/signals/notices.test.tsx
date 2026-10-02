// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'

const tell = vi.fn<(title: string, body: string, tag: string) => void>()
vi.mock('./notify', () => ({ tell: (t: string, b: string, g: string) => tell(t, b, g) }))

import { useNotices } from './useNotices'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 's', domain: 'shop.example', last_event_at: 1 } as Site
type P = { online: number | null; scope: string; sources?: string[]; visits?: { ts: number }[] }
function Notices(p: P) {
  useNotices({ site, online: p.online, visits: (p.visits ?? []) as never, scope: p.scope, sources: p.sources })
  return null
}

let root: Root
let host: HTMLDivElement
const draw = (p: P) => act(() => root.render(<Notices {...p} />))

beforeEach(() => {
  tell.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('what the live page tells', () => {
  it('names a source that has its first sale, and not the ones the first look finds', () => {
    draw({ online: 1, scope: 'a', sources: undefined })
    draw({ online: 1, scope: 'a', sources: ['Search', 'Direct'] })
    expect(tell).not.toHaveBeenCalled()
    draw({ online: 1, scope: 'a', sources: ['Search', 'Direct', 'Email'] })
    expect(tell).toHaveBeenCalledTimes(1)
    expect(tell.mock.calls[0][0]).toBe('First sale from Email')
    draw({ online: 1, scope: 'a', sources: ['Search', 'Direct', 'Email'] })
    expect(tell).toHaveBeenCalledTimes(1)
  })

  it('does not call another report a new source: a new period or filter starts the list over', () => {
    draw({ online: 1, scope: 'a', sources: ['Search'] })
    draw({ online: 1, scope: 'b', sources: ['Search', 'Email'] })
    expect(tell).not.toHaveBeenCalled()
  })

  it('tells a spike in who is online, against what the tab has seen', () => {
    // The count moves between 2 and 3 a while: that is what is usual here.
    for (let i = 0; i < 8; i++) draw({ online: 2 + (i % 2), scope: 'a', sources: undefined })
    expect(tell).not.toHaveBeenCalled()
    draw({ online: 9, scope: 'a', sources: undefined })
    expect(tell).toHaveBeenCalledTimes(1)
    expect(tell.mock.calls[0][0]).toBe('9 online: about three times usual')
  })

  it('tells tracking gone quiet once, and again only after a visit', () => {
    vi.useFakeTimers()
    const now = Date.now()
    vi.setSystemTime(now)
    const quietSite = { ...site, last_event_at: Math.floor(now / 1000) - 7 * 3600 } as Site
    function Quiet({ visits }: { visits: { ts: number }[] }) {
      useNotices({ site: quietSite, online: 0, visits: visits as never, scope: 'a' })
      return null
    }
    act(() => root.render(<Quiet visits={[]} />))
    act(() => void vi.advanceTimersByTime(61_000))
    expect(tell).toHaveBeenCalledTimes(1)
    expect(tell.mock.calls[0][0]).toBe('Tracking stopped on shop.example')
    act(() => void vi.advanceTimersByTime(10 * 60_000))
    expect(tell).toHaveBeenCalledTimes(1)
  })
})
