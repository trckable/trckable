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
// The choices are the kit's popover, on the page's body (not inside the list).
const items = () => [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')]
const item = (_host: HTMLElement, label: string) => items().find((b) => b.textContent === label)

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
    expect(m.host.querySelectorAll('.nff button')).toHaveLength(2) // the footer is one quiet row: the archive and the alert settings
    const show = m.host.querySelector<HTMLButtonElement>('.nff [aria-pressed]')
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
    expect(items().map((b) => b.textContent)).toEqual(['Mute this for this site', 'Change this alert'])
    act(() => item(m.host, 'Mute this for this site')?.click())
    await act(() => new Promise((r) => setTimeout(r, 10)))
    expect(off).toHaveBeenCalledWith('s1')
    expect(save).toHaveBeenCalledWith('s1', expect.objectContaining({ id: 'x', kind: 'stopped', enabled: false }))
    menu(m.host, 0)
    act(() => item(m.host, 'Change this alert')?.click())
    expect(open).toHaveBeenCalledWith(site, 'alerts', { focus: 'alert:stopped' })
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

describe('the filter', () => {
  const down = n('down:i1', false, { kind: 'down', site: 'a.com', siteId: 's1' })
  const sale = n('m1', false, { kind: 'milestone', site: 'b.com', siteId: 's2' })
  const filterBtn = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.nfh .nfq')
  const radio = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')].find((b) => b.textContent?.startsWith(label))
  const choose = (host: HTMLElement, label: string) => {
    act(() => filterBtn(host)?.click())
    act(() => radio(label)?.click())
  }

  it('is one button in the header row; it narrows the list, says how above it, and is cleared from there', () => {
    localStorage.clear()
    const m = mount([down, sale])
    expect(m.host.querySelectorAll('.nfc, select')).toHaveLength(0) // nothing inline
    expect(filterBtn(m.host)?.querySelector('.nfd')).toBeNull()
    act(() => filterBtn(m.host)?.click())
    expect([...document.querySelectorAll('[role=group]')].map((g) => g.getAttribute('aria-label'))).toEqual(['Show']) // one site known: no Site group
    act(() => radio('Milestones')?.click())
    expect([...m.host.querySelectorAll('.nft b')].map((b) => b.textContent)).toEqual(['m1'])
    expect(m.host.querySelector('.nfact')?.textContent).toBe('Milestones')
    expect(filterBtn(m.host)?.querySelector('.nfd')).not.toBeNull()
    expect(localStorage.getItem('trckable.bell.filter')).toContain('milestones')
    choose(m.host, 'Busy')
    expect(m.host.querySelector('.xnone')?.textContent).toBe('Nothing here')
    act(() => m.host.querySelector<HTMLButtonElement>('.nfact .nfq')?.click())
    expect(m.host.querySelectorAll('.nfact')).toHaveLength(0)
    expect(m.host.querySelectorAll('.nft b')).toHaveLength(2)
    m.stop()
    localStorage.clear()
  })

  it('has a Site group only with several sites', () => {
    localStorage.clear()
    const m = mount([down, sale], { sites: [site, { id: 's2', domain: 'b.com' }] })
    act(() => filterBtn(m.host)?.click())
    expect([...document.querySelectorAll('[role=group]')].map((g) => g.getAttribute('aria-label'))).toEqual(['Show', 'Site'])
    act(() => radio('b.com')?.click())
    expect(m.host.querySelector('.nfact')?.textContent).toBe('b.com')
    expect([...m.host.querySelectorAll('.nft b')]).toHaveLength(1)
    m.stop()
    localStorage.clear()
  })
})
