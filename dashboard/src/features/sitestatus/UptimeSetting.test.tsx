// @vitest-environment happy-dom
// The uptime check's settings: the switch pauses it, up to five pages of the site's own domain are added and removed,
// and a viewer sees them and changes nothing.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ uptime: vi.fn(), setUptimePaused: vi.fn(), addUptimePath: vi.fn(), removeUptimePath: vi.fn() }))
vi.mock('../../lib/apiMore', async (orig) => ({ ...(await orig<typeof import('../../lib/apiMore')>()), more: api }))

import type { Site } from '../../lib/api'
import { setRole } from '../../lib/me'
import { UptimeSetting } from './UptimeSetting'
import { copy } from './uptimeCopy'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 's1', domain: 'a.com' } as Site
let root: Root
let host: HTMLDivElement
const submit = () =>
  act(() => {
    host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const show = async () => {
  act(() => root.render(<UptimeSetting site={site} />))
  await settle()
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.uptime.mockResolvedValue({ paused: false, paths: ['/pricing'], max: 5 })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('uptime check settings', () => {
  it('pauses and resumes with the switch, and says so', async () => {
    setRole('owner')
    api.setUptimePaused.mockResolvedValue({ paused: true, paths: ['/pricing'], max: 5 })
    await show()
    const sw = host.querySelector('[role=switch]') as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('true')
    act(() => sw.click())
    await settle()
    expect(api.setUptimePaused).toHaveBeenCalledWith('s1', true)
    expect(host.textContent).toContain(copy.pausedHint)
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('adds a page and removes one', async () => {
    setRole('owner')
    api.addUptimePath.mockResolvedValue({ paused: false, paths: ['/pricing', '/blog'], max: 5 })
    api.removeUptimePath.mockResolvedValue({ paused: false, paths: ['/blog'], max: 5 })
    await show()
    const input = host.querySelector('input') as HTMLInputElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '/blog')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    submit()
    await settle()
    expect(api.addUptimePath).toHaveBeenCalledWith('s1', '/blog')
    expect([...host.querySelectorAll('li code')].map((c) => c.textContent)).toEqual(['/pricing', '/blog'])
    act(() => (host.querySelector(`[aria-label="${copy.remove('/pricing')}"]`) as HTMLButtonElement).click())
    await settle()
    expect(api.removeUptimePath).toHaveBeenCalledWith('s1', '/pricing')
    expect([...host.querySelectorAll('li code')].map((c) => c.textContent)).toEqual(['/blog'])
  })

  it('says why a page was refused, and stops offering the form at five', async () => {
    setRole('owner')
    api.addUptimePath.mockRejectedValue(new Error('no'))
    await show()
    const input = host.querySelector('input') as HTMLInputElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'https://evil.com')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    submit()
    await settle()
    expect(host.textContent).toContain(copy.pathError)
    act(() => root.unmount())
    root = createRoot(host)
    api.uptime.mockResolvedValue({ paused: false, paths: ['/a', '/b', '/c', '/d', '/e'], max: 5 })
    await show()
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain(copy.full(5))
  })

  it('shows a viewer the settings without a way to change them', async () => {
    setRole('viewer')
    await show()
    expect((host.querySelector('[role=switch]') as HTMLButtonElement).disabled).toBe(true)
    expect(host.querySelector('form')).toBeNull()
    expect(host.querySelectorAll('li button')).toHaveLength(0)
  })
})
