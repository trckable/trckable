// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, type Site } from '../../lib/api'
import { incidents } from '../../features/incidents/api'
import { more } from '../../lib/apiMore'
import { V2ExtrasContext, type V2Extras } from '../slots'
import type { Notice } from './notices'
import { Bell } from './Bell'
import { useNotices } from './useNotices'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 's1', domain: 'a.com' } as Site
const now = Math.floor(Date.now() / 1000)
const hosted = (id: string, at: number, extra: Partial<Notice> = {}): Notice => ({ id, kind: 'plan', site: '', title: id, sub: 's', at, ...extra })
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)))

function Harness({ sites }: { extras: V2Extras; sites: Site[] }) {
  const notices = useNotices(sites[0] ?? null, sites)
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

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('the bell after a row is opened', () => {
  it('holds hosted rows back until the build says its list is read, then shows all at once', async () => {
    vi.spyOn(incidents, 'account').mockResolvedValue({ incidents: [{ id: 'i1', site: 's1', kind: 'down', started_at: now - 100, ended_at: null, cause: '', expected_visits: null, note: '' }] })
    vi.spyOn(api, 'milestones').mockResolvedValue({ enabled: true, milestones: [], moment: null })
    vi.spyOn(more, 'bellRead').mockResolvedValue({ read: [] })
    const base = { readAll: () => undefined, dismiss: () => undefined, archive: { items: [], load: () => undefined, loading: false, words: { dismiss: 'd', archive: 'a', fresh: 'f', none: 'n' } } }
    const m = mount({ bell: [hosted('plan', now - 50)], bellMore: { ...base, ready: false } }, [site])
    open()
    await flush()
    expect(m.host.querySelectorAll('.nfs')).toHaveLength(1) // a single placeholder, not the hosted row alone
    expect(rows(m.host)).toEqual([])
    m.draw({ bell: [hosted('plan', now - 50)], bellMore: { ...base, ready: true } })
    await flush()
    expect(rows(m.host)).toEqual(['plan', 'a.com stopped answering'])
    m.stop()
  })

  it('keeps its rows when a row is opened, the page mounts the bell again and the read marks arrive late', async () => {
    vi.spyOn(incidents, 'account').mockResolvedValue({ incidents: [{ id: 'i1', site: 's1', kind: 'down', started_at: now - 100, ended_at: null, cause: '', expected_visits: null, note: '' }] })
    vi.spyOn(api, 'milestones').mockResolvedValue({ enabled: true, milestones: [], moment: null })
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
    expect(rows(first.host)).toEqual(['plan', 'a.com stopped answering'])
    // Open the hosted row: the build marks it read and takes it out of its list; the page moves on and mounts the bell again, before the sites are known.
    act(() => document.querySelectorAll<HTMLButtonElement>('.nf')[0].click())
    expect(opened).toHaveBeenCalled()
    first.stop()
    const again = mount({ bell: [] }, [])
    open()
    expect(rows(again.host)).toEqual(['a.com stopped answering']) // the list of the last read, in the first frame
    expect(again.host.querySelector('.xnone')).toBeNull()
    await flush()
    expect(rows(again.host)).toEqual(['a.com stopped answering'])
    again.stop()
  })
})
