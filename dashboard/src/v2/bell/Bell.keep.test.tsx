// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import { setEmail } from '../../lib/me'
import type { FeedRow } from './feed'
import { V2ExtrasContext, type V2Extras } from '../slots'
import type { Notice } from './notices'
import { Bell } from './Bell'
import { useNotices } from './useNotices'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 's1', domain: 'a.com' } as Site
const down: FeedRow = { id: 'down:i1', kind: 'down', site: 's1', at: Math.floor(Date.now() / 1000) - 100 }
const now = Math.floor(Date.now() / 1000)
const hosted = (id: string, at: number, extra: Partial<Notice> = {}): Notice => ({ id, kind: 'plan', site: '', title: id, sub: 's', at, ...extra })
const DOWN = /^a\.com down since \d\d:\d\d$/
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)))

function Harness({ sites }: { extras: V2Extras; sites: Site[] }) {
  const notices = useNotices(sites)
  return <Bell site={sites[0] ?? null} notices={notices} />
}

function mount(extras: V2Extras, sites: Site[]) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const draw = (e: V2Extras = extras) => act(() => root.render(<Provider extras={e} sites={sites} />))
  draw()
  return { host, draw, stop: () => act(() => root.unmount()) }
}
// The provider sits above the hook, as a build's does.
function Provider({ extras, sites }: { extras: V2Extras; sites: Site[] }) {
  return (
    <V2ExtrasContext.Provider value={extras}>
      <Harness extras={extras} sites={sites} />
    </V2ExtrasContext.Provider>
  )
}

const rows = (host: HTMLElement) => [...host.querySelectorAll('.nft b')].map((b) => b.textContent)
const open = () => act(() => document.querySelector<HTMLButtonElement>('#bellBtn')?.click())

// The bell asks the server once: answered here, so no read waits on a network that is not there.
beforeEach(() => {
  setEmail('a@x.com')
  vi.spyOn(more, 'notifications').mockResolvedValue({ notifications: [down] })
})

afterEach(() => {
  setEmail()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('the bell after a row is opened', () => {
  it('holds hosted rows back until the build says its list is read, then shows all at once', async () => {
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    const base = { readAll: () => undefined, dismiss: () => undefined, archive: { items: [], load: () => undefined, loading: false, words: { none: 'n' } } }
    const m = mount({ bell: [hosted('plan', now - 50)], bellMore: { ...base, ready: false } }, [site])
    open()
    await flush()
    expect(m.host.querySelectorAll('.nfs')).toHaveLength(1) // a single placeholder, not the hosted row alone
    expect(rows(m.host)).toEqual([])
    m.draw({ bell: [hosted('plan', now - 50)], bellMore: { ...base, ready: true } })
    await flush()
    expect(rows(m.host)).toEqual(['plan', expect.stringMatching(DOWN)])
    m.stop()
  })

  it('keeps its rows when a row is opened, the page mounts the bell again and the read marks arrive late', async () => {
    let answer: (v: { read: string[] }) => void = () => undefined
    vi.spyOn(more, 'bellRead').mockReturnValue(new Promise((r) => (answer = r)))
    vi.spyOn(more, 'markBellRead').mockResolvedValue({ read: [] })
    const opened = vi.fn()
    const extras: V2Extras = { bell: [hosted('plan', now - 50, { open: opened })] }
    const first = mount(extras, [site])
    open()
    await flush()
    answer({ read: [] })
    await flush()
    expect(rows(first.host)).toEqual(['plan', expect.stringMatching(DOWN)])
    // Open the hosted row: the build marks it read and takes it out of its list; the page moves on and mounts the bell again, before the sites are known.
    act(() => document.querySelectorAll<HTMLButtonElement>('.nf')[0].click())
    expect(opened).toHaveBeenCalled()
    first.stop()
    const again = mount({ bell: [] }, [])
    open()
    expect(rows(again.host)).toEqual([expect.stringMatching(DOWN)]) // the list of the last read, in the first frame
    expect(again.host.querySelector('.xnone')).toBeNull()
    await flush()
    expect(rows(again.host)).toEqual([expect.stringMatching(DOWN)])
    again.stop()
  })

  it('keeps the list drawn, node for node, when it is read again while open', async () => {
    const m = mount({ bell: [] }, [site])
    open()
    await flush()
    const before = [...m.host.querySelectorAll('.nfw')]
    expect(before).toHaveLength(1)
    vi.mocked(more.notifications).mockResolvedValue({ notifications: [{ ...down }] })
    m.draw()
    await flush()
    expect(m.host.querySelector('.nfs')).toBeNull()
    expect([...m.host.querySelectorAll('.nfw')]).toEqual(before)
    expect(before[0].isConnected).toBe(true)
    m.stop()
  })

  it('opening the panel reads nothing; opening one row reads only that one; the badge is the list\'s unread rows, also after a reload', async () => {
    const badge = () => document.querySelector('#bellDot')?.textContent
    const marked: string[][] = []
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    vi.spyOn(more, 'markBellRead').mockImplementation((ids: string[]) => {
      marked.push(ids)
      return Promise.resolve({ read: ids })
    })
    const extras = (): V2Extras => ({ bell: ['p1', 'p2', 'p3', 'p4'].map((id, i) => hosted(id, now - 10 - i, { open: () => undefined })) })
    vi.mocked(more.notifications).mockResolvedValue({ notifications: [] })
    const m = mount(extras(), [site])
    await flush()
    await act(() => new Promise((r) => setTimeout(r, 3100)))
    expect(badge()).toBe('4')
    open()
    await flush()
    expect(badge()).toBe('4') // seen, not read
    expect(marked.flat()).toEqual([])
    act(() => document.querySelectorAll<HTMLButtonElement>('.nf')[0].click())
    await flush()
    expect(marked.flat()).toEqual(['p1'])
    expect(badge()).toBe('3')
    m.stop()
    // A reload: the mark is the account's; the other three are still unread.
    vi.mocked(more.bellRead).mockResolvedValue({ read: ['p1'] })
    const again = mount(extras(), [site])
    await flush()
    await act(() => new Promise((r) => setTimeout(r, 3100)))
    expect(badge()).toBe('3')
    again.stop()
  }, 20_000)
})
