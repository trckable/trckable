// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { setAccount, setEmail } from '../../lib/me'
import { more } from '../../lib/apiMore'
import { Bell } from './Bell'
import { saveFeed, type FeedRow } from './feed'
import { useNotices } from './useNotices'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const now = Math.floor(Date.now() / 1000)
const one = [{ id: 's1', domain: 'a.com' }] as Site[]
const two = [{ id: 's2', domain: 'b.com' }] as Site[]
const mention = (id: string, site: string, domain: string, at: number): FeedRow => ({ id, kind: 'mention', site, domain, at, host: 'x.com', source: 'news', text: 'T' })
const feedA = [mention('m:a1', 's1', 'a.com', now - 100), mention('m:a2', 's1', 'a.com', now - 200)]
const feedB = [mention('m:b1', 's2', 'b.com', now - 50)]

let current = one
function Harness() {
  return <Bell site={current[0]} notices={useNotices(current)} />
}

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Harness />))
  return { host, rerender: () => act(() => root.render(<Harness />)), stop: () => act(() => root.unmount()) }
}

const ids = (host: HTMLElement) => [...host.querySelectorAll('.nfw')].map((r) => r.getAttribute('data-id'))
const open = () => act(() => document.querySelector<HTMLButtonElement>('#bellBtn')?.click())
const wait = (ms = 30) => act(() => new Promise((r) => setTimeout(r, ms)))

beforeEach(() => {
  setEmail('a@x.com')
  setAccount('t1')
  current = one
  vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
  vi.spyOn(more, 'markBellRead').mockResolvedValue({ read: [] })
})

afterEach(() => {
  setEmail()
  setAccount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('the bell when the team or the sites change', () => {
  it('shows no row of the last team after a switch, with the menu open, and reads the new one at once', async () => {
    saveFeed('t1|a@x.com', feedA)
    const list = vi.spyOn(more, 'notifications').mockResolvedValueOnce({ notifications: feedA }).mockResolvedValue({ notifications: feedB })
    const m = mount()
    open()
    await wait()
    expect(ids(m.host)).toEqual(['m:a1', 'm:a2'])
    setAccount('t2')
    current = two
    m.rerender()
    expect(ids(m.host)).toEqual([])
    await wait()
    expect(ids(m.host)).toEqual(['m:b1'])
    expect(list.mock.calls.length).toBe(2)
    m.stop()
  })

  it('drops a late answer meant for the team it has left', async () => {
    saveFeed('t1|a@x.com', feedA)
    let late: (v: { notifications: FeedRow[] }) => void = () => undefined
    vi.spyOn(more, 'notifications')
      .mockReturnValueOnce(new Promise((r) => (late = r)))
      .mockResolvedValue({ notifications: feedB })
    const m = mount()
    open()
    await wait(20)
    setAccount('t2')
    current = two
    m.rerender()
    await wait()
    late({ notifications: feedA })
    await wait()
    expect(ids(m.host)).toEqual(['m:b1'])
    expect(localStorage.getItem('trckable:bell:feed')).toContain('t2|a@x.com')
    m.stop()
  })

  it('draws nothing, and no badge, until the sites are loaded', () => {
    saveFeed('t1|a@x.com', feedA)
    current = []
    vi.spyOn(more, 'notifications').mockReturnValue(new Promise(() => undefined))
    const m = mount()
    open()
    expect(ids(m.host)).toEqual([])
    m.stop()
  })

  it('still tells the server the first list was given when the answer arrives after a switch', async () => {
    let late: (v: { notifications: FeedRow[]; first?: boolean }) => void = () => undefined
    vi.spyOn(more, 'notifications')
      .mockReturnValueOnce(new Promise((r) => (late = r)))
      .mockResolvedValue({ notifications: feedB })
    const m = mount()
    await wait(20)
    setAccount('t2')
    current = two
    m.rerender()
    await wait()
    late({ notifications: feedA, first: true })
    await wait()
    expect(vi.mocked(more.markBellRead).mock.calls.flat(2)).toContain('m:a1')
    m.stop()
  })

  it('marks every unread row of the scope read, the ones past the menu’s cap too', async () => {
    const many = Array.from({ length: 60 }, (_, i) => mention(`m:${i}`, 's1', 'a.com', now - 100 - i))
    saveFeed('t1|a@x.com', many)
    vi.spyOn(more, 'notifications').mockResolvedValue({ notifications: many })
    const m = mount()
    open()
    await wait()
    const all = [...m.host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Mark all read'))
    act(() => all?.click())
    const sent = new Set(vi.mocked(more.markBellRead).mock.calls.flatMap((c) => c[0]))
    expect(sent.has('m:59')).toBe(true)
    m.stop()
  })
})

