// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import { Bell } from './Bell'
import { saveFeed, type FeedRow } from './feed'
import { useNotices } from './useNotices'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const sites = [{ id: 's1', domain: 'a.com' }] as Site[]
const now = Math.floor(Date.now() / 1000)
const feed: FeedRow[] = [
  { id: 'mention:3', kind: 'mention', site: 's1', domain: 'a.com', at: now - 100, host: 'news.ycombinator.com', source: 'hn', text: 'T' },
  { id: 'down:i1', kind: 'down', site: 's1', domain: 'a.com', at: now - 200 },
  { id: 'mention:1', kind: 'mention', site: 's1', domain: 'a.com', at: now - 300, host: 'x.com', source: 'news', text: 'U' },
]

function Harness() {
  return <Bell site={sites[0]} notices={useNotices(sites)} />
}

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Harness />))
  return { host, stop: () => act(() => root.unmount()) }
}

const ids = (host: HTMLElement) => [...host.querySelectorAll('.nfw')].map((r) => r.getAttribute('data-id'))
const open = () => act(() => document.querySelector<HTMLButtonElement>('#bellBtn')?.click())

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('the bell’s list', () => {
  it('is drawn at once from the last list this browser kept, before the server has answered, with no placeholder', () => {
    saveFeed('s1', feed)
    vi.spyOn(more, 'notifications').mockReturnValue(new Promise(() => undefined))
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    const m = mount()
    open()
    expect(ids(m.host)).toEqual(['mention:3', 'down:i1', 'mention:1'])
    expect(m.host.querySelector('.nfs')).toBeNull()
    m.stop()
  })

  it('asks the server once, and keeps every row where it was when one is marked read', async () => {
    saveFeed('s1', feed)
    const list = vi.spyOn(more, 'notifications').mockResolvedValue({ notifications: feed })
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    const post = vi.spyOn(more, 'markBellRead').mockResolvedValue({ read: [] })
    const m = mount()
    open()
    await act(() => new Promise((r) => setTimeout(r, 20)))
    const before = ids(m.host)
    act(() => m.host.querySelector<HTMLButtonElement>('[data-id="down:i1"] .nf')?.click())
    expect(post).toHaveBeenCalledWith(['down:i1'])
    open() // a row opened shuts the menu
    expect(m.host.querySelector('[data-id="down:i1"] .nfd')?.classList.contains('off')).toBe(true)
    expect(ids(m.host)).toEqual(before)
    expect(list.mock.calls.length).toBeLessThanOrEqual(1)
    m.stop()
  })
})
