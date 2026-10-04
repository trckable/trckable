// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../lib/api'
import AccountItems from './AccountItems'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 'tkb_a', domain: 'shop.example', name: 'Shop', timezone: 'UTC', currency: 'USD', proxy_key: '' } as Site
let root: Root
let host: HTMLDivElement
const go = (fn: () => void) => () => fn()
const draw = (s?: Site) => act(() => root.render(<AccountItems profile={null} v={0} go={go} site={s} />))
const item = () => [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => /browser/.test(b.textContent ?? ''))

describe('the avatar menu: exclude my visits', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('says it neutrally, because the dashboard cannot see the site\'s browser', () => {
    draw(site)
    expect(item()?.textContent).toBe('Exclude this browser')
  })

  it('opens the site with ?trckable=ignore in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    draw(site)
    act(() => item()?.click())
    expect(open).toHaveBeenCalledWith('https://shop.example/?trckable=ignore', '_blank', 'noopener')
  })

  it('then offers the way back, ?trckable=track', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    draw(site)
    act(() => item()?.click())
    draw(site)
    expect(item()?.textContent).toBe('Count this browser again')
    act(() => item()?.click())
    expect(open).toHaveBeenLastCalledWith('https://shop.example/?trckable=track', '_blank', 'noopener')
    draw(site)
    expect(item()?.textContent).toBe('Exclude this browser')
  })

  it('is absent with no site on screen, and for a cookieless site', () => {
    draw(undefined)
    expect(item()).toBeUndefined()
    draw({ ...site, cookieless: true })
    expect(item()).toBeUndefined()
  })
})
