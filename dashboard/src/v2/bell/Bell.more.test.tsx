// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { more } from '../../lib/apiMore'
import { setRole } from '../../lib/me'
import * as settings from '../../lib/settings'
import type { Notice } from './notices'
import { Bell } from './Bell'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 's1', domain: 'a.com' } as Site
const now = Math.floor(Date.now() / 1000)
const n = (id: string, dismissable: boolean, extra: Partial<Notice> = {}): Notice => ({ id, kind: 'plan', site: '', title: id, sub: 'sub', at: now - 60, dismissable, ...extra })

function mount(items: Notice[], over: Record<string, unknown> = {}) {
  const notices = {
    items,
    read: new Set<string>(),
    refresh: vi.fn(),
    mark: vi.fn(),
    markAll: () => undefined,
    can: true,
    ready: true,
    sites: [site],
    dismiss: vi.fn(),
    archive: { items: [n('old one', false)], load: vi.fn(), loading: false, words: { none: 'Nothing here' } },
    ...over,
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Bell site={null} notices={notices as never} />))
  act(() => host.querySelector<HTMLButtonElement>('#bellBtn')?.click())
  return { host, notices, stop: () => act(() => root.unmount()) }
}
const menu = (host: HTMLElement, row: number) => act(() => host.querySelectorAll<HTMLButtonElement>('.nfx')[row].click())
const item = (host: HTMLElement, label: string) => [...host.querySelectorAll<HTMLButtonElement>('.nfa button')].find((b) => b.textContent === label)

beforeEach(() => setRole('owner'))
afterEach(() => {
  vi.restoreAllMocks()
  setRole()
  document.body.innerHTML = ''
})

describe('a build’s own list in the bell', () => {
  it('puts a notice away from its ⋯, and shows the archive as a second view at the end of the list', () => {
    const m = mount([n('keep', false), n('away', true)])
    expect(m.host.querySelectorAll('.nfx')).toHaveLength(1) // only the one that may be put away has a ⋯
    menu(m.host, 0)
    act(() => item(m.host, 'Archive')?.click())
    expect(m.notices.dismiss).toHaveBeenCalledWith('away')
    expect(m.host.querySelectorAll('.nff button')).toHaveLength(1) // the footer is the one Settings link
    const show = m.host.querySelector<HTMLButtonElement>('.nfar')
    act(() => show?.click())
    expect(m.notices.archive.load).toHaveBeenCalled()
    expect(m.host.textContent).toContain('old one')
    expect(m.host.querySelectorAll('.nfx')).toHaveLength(0)
    m.stop()
  })

  it('lists the rows under their day, each with only its time', () => {
    const m = mount([n('a', false)])
    expect(m.host.querySelector('.nfdy')?.textContent).toBe('Today')
    expect(m.host.querySelector('.nft small')?.textContent).toMatch(/^sub · \d\d:\d\d$/)
    m.stop()
  })
})

describe('a row’s ⋯ for an alert', () => {
  const stopped = n('down:i1', false, { kind: 'down', site: 'a.com', siteId: 's1', bad: true })

  it('mutes that alert for that site, and changes it in Settings', async () => {
    const off = vi.spyOn(more, 'alerts').mockResolvedValue({ alerts: [{ id: 'x', site_id: 's1', kind: 'stopped', enabled: true, target: 't', threshold: 6, last_fired: 0, created_at: 1 }], kinds: [] })
    const save = vi.spyOn(more, 'saveAlert').mockResolvedValue({} as never)
    const open = vi.spyOn(settings, 'openSettings').mockImplementation(() => undefined)
    const m = mount([stopped])
    menu(m.host, 0)
    expect([...m.host.querySelectorAll('.nfa button')].map((b) => b.textContent)).toEqual(['Mute this for this site', 'Change this alert'])
    act(() => item(m.host, 'Mute this for this site')?.click())
    await act(() => new Promise((r) => setTimeout(r, 10)))
    expect(off).toHaveBeenCalledWith('s1')
    expect(save).toHaveBeenCalledWith('s1', expect.objectContaining({ id: 'x', kind: 'stopped', enabled: false }))
    menu(m.host, 0)
    act(() => item(m.host, 'Change this alert')?.click())
    expect(open).toHaveBeenCalledWith(site, 'alerts')
    m.stop()
  })

  it('is not offered to a viewer, who may not change alerts', () => {
    setRole('viewer')
    const m = mount([stopped])
    expect(m.host.querySelectorAll('.nfx')).toHaveLength(0)
    m.stop()
  })

  it('gives a row of several sites no mute (it names no one site) and lists its sites', () => {
    const a = n('s-a', false, { kind: 'spike', site: 'a.com', siteId: 's1' })
    const b = n('s-b', false, { kind: 'spike', site: 'b.com', siteId: 's2' })
    const m = mount([a, b])
    expect(m.host.querySelector('.nft b')?.textContent).toBe('2 sites are busy')
    expect([...m.host.querySelectorAll('.nfn')].map((x) => x.textContent?.replace(/ · .*/, ''))).toEqual(['a.com', 'b.com'])
    expect(m.host.querySelectorAll('.nfx')).toHaveLength(0)
    m.stop()
  })
})
