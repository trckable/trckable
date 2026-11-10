// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { setEmail } from '../../lib/me'
import { more } from '../../lib/apiMore'
import { Bell } from './Bell'
import { clearFeed, loadFeed, saveFeed, type FeedRow } from './feed'
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

beforeEach(() => setEmail('a@x.com'))

afterEach(() => {
  setEmail()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('the bell’s list', () => {
  it('is drawn at once from the last list this browser kept, before the server has answered, with no placeholder', () => {
    saveFeed('|a@x.com', feed)
    vi.spyOn(more, 'notifications').mockReturnValue(new Promise(() => undefined))
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    const m = mount()
    open()
    expect(ids(m.host)).toEqual(['mention:3', 'down:i1', 'mention:1'])
    expect(m.host.querySelector('.nfs')).toBeNull()
    m.stop()
  })

  it('asks the server once, and keeps every row where it was when one is marked read', async () => {
    saveFeed('|a@x.com', feed)
    const list = vi.spyOn(more, 'notifications').mockResolvedValue({ notifications: feed })
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    const post = vi.spyOn(more, 'markBellRead').mockResolvedValue({ read: [] })
    const m = mount()
    open()
    await act(() => new Promise((r) => setTimeout(r, 20)))
    const before = ids(m.host)
    act(() => m.host.querySelector<HTMLButtonElement>('[data-id="down:i1"] .nf')?.click())
    expect(post.mock.calls.flat(2)).toContain('down:i1') // read when the panel opened
    open() // a row opened shuts the menu
    expect(m.host.querySelector('[data-id="down:i1"] .nfd')?.classList.contains('off')).toBe(true)
    expect(ids(m.host)).toEqual(before)
    expect(list.mock.calls.length).toBeLessThanOrEqual(1)
    m.stop()
  })
})

describe('what this browser keeps', () => {
  it('is painted for the person who read it and for no one else, and is gone once forgotten', () => {
    saveFeed('|a@x.com', feed)
    expect(loadFeed('|a@x.com')).toHaveLength(3)
    expect(loadFeed('|b@x.com')).toBeNull()
    expect(loadFeed('')).toBeNull()
    clearFeed()
    expect(loadFeed('|a@x.com')).toBeNull()
  })

  it('does not paint an account switch with the last person’s rows', () => {
    saveFeed('|a@x.com', feed)
    setEmail('b@x.com')
    vi.spyOn(more, 'notifications').mockReturnValue(new Promise(() => undefined))
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    const m = mount()
    open()
    expect(ids(m.host)).toEqual([])
    m.stop()
  })
})

describe('a list that comes from the server', () => {
  it('keeps the list shown when the read was partial, and a down site stays', async () => {
    saveFeed('|a@x.com', feed)
    vi.spyOn(more, 'notifications').mockResolvedValue({ notifications: [], partial: true })
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    const m = mount()
    open()
    await act(() => new Promise((r) => setTimeout(r, 20)))
    act(() => void window.dispatchEvent(new Event('visibilitychange')))
    expect(ids(m.host)).toContain('down:i1')
    m.stop()
  })

  it('marks everything read the first time a person is given the list, once', async () => {
    const post = vi.spyOn(more, 'markBellRead').mockResolvedValue({ read: [] })
    vi.spyOn(more, 'notifications').mockResolvedValue({ notifications: feed, first: true })
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    const m = mount()
    open()
    await act(() => new Promise((r) => setTimeout(r, 30)))
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0].sort()).toEqual(['down:i1', 'mention:1', 'mention:3'])
    m.stop()
  })
})
