// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { surgeApi } from '../../features/signals/surge'
import { setRole } from '../../lib/me'
import * as url from '../../lib/url'
import type { Notice } from './notices'
import { Bell } from './Bell'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 's1', domain: 'a.com', timezone: 'UTC' } as Site
const now = Math.floor(Date.now() / 1000)
const busy: Notice = { id: 'busy:surge:x', kind: 'spike', site: 'a.com', title: 'a.com is busy', sub: '52 online · 2.4× usual', at: now - 600, source: 'l.facebook.com', busy: { visitors: 52, factor: 2.4 } }

function mount(items: Notice[]) {
  const notices = { items, read: new Set<string>(), refresh: vi.fn(), mark: vi.fn(), markAll: () => undefined, can: true, ready: true, sites: [site], dismiss: undefined, archive: undefined }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Bell site={site} notices={notices as never} />))
  act(() => host.querySelector<HTMLButtonElement>('#bellBtn')?.click())
  return { host, stop: () => act(() => root.unmount()) }
}

beforeEach(() => {
  setRole('owner')
  vi.spyOn(surgeApi, 'now').mockResolvedValue(null)
  vi.spyOn(surgeApi, 'near').mockResolvedValue(null)
})
afterEach(() => {
  vi.restoreAllMocks()
  setRole()
  document.body.innerHTML = ''
})

describe('a busy row in the bell', () => {
  it('opens the moment’s story, and its one button leads to Explore on that source', async () => {
    const set = vi.spyOn(url, 'setView').mockImplementation(() => undefined)
    const m = mount([busy])
    act(() => m.host.querySelector<HTMLButtonElement>('.nf')?.click())
    await vi.waitFor(() => expect(document.querySelector('.surge-modal')).not.toBeNull())
    const go = [...document.querySelectorAll<HTMLButtonElement>('.surge-modal .btn.primary')]
    expect(go.map((b) => b.textContent)).toEqual(['See it in Explore'])
    act(() => go[0].click())
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ xp: 'overview', xf: [{ dim: 'referrer', value: 'l.facebook.com' }] }))
    m.stop()
  })
})

describe('an empty bell', () => {
  it('says so, with only the alert settings to do', () => {
    const m = mount([])
    expect(m.host.querySelector('.nfe b')?.textContent).toBe('You’re all caught up')
    expect(m.host.querySelector('.nfh .lk3')).toBeNull()
    expect(m.host.querySelector('.nff')).toBeNull()
    expect(m.host.querySelector('.nfe .lk3')?.textContent).toContain('Alert settings')
    m.stop()
  })
})
