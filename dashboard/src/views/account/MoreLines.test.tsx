// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'
import { OwnVisitsCard } from './MoreLines'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site = { id: 'tkb_a', domain: 'shop.example', name: 'Shop', timezone: 'UTC', currency: 'USD', proxy_key: '' } as Site
let root: Root
let host: HTMLDivElement
const draw = (sites: Site[]) => act(() => root.render(<OwnVisitsCard sites={sites} />))
const button = () => host.querySelector<HTMLButtonElement>('button')

describe('the account window: exclude my visits', () => {
  beforeEach(() => {
    history.pushState(null, '', '/shop.example')
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
    draw([site])
    expect(button()?.textContent).toBe('Exclude this browser')
  })

  it('opens the site with ?trckable=ignore in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    draw([site])
    act(() => button()?.click())
    expect(open).toHaveBeenCalledWith('https://shop.example/?trckable=ignore', '_blank', 'noopener')
  })

  it('then offers the way back, ?trckable=track', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    draw([site])
    act(() => button()?.click())
    expect(button()?.textContent).toBe('Count this browser again')
    act(() => button()?.click())
    expect(open).toHaveBeenLastCalledWith('https://shop.example/?trckable=track', '_blank', 'noopener')
    expect(button()?.textContent).toBe('Exclude this browser')
  })

  it('is absent with no site on screen, and for a cookieless site', () => {
    draw([])
    expect(button()).toBeNull()
    draw([{ ...site, cookieless: true }])
    expect(button()).toBeNull()
    history.pushState(null, '', '/sites')
    draw([site])
    expect(button()).toBeNull()
  })
})
