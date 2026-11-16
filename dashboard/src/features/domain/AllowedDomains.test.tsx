// @vitest-environment happy-dom
// Allowed domains: the list with its chips, a typed address cleaned the way the
// server keeps it, a refused host one tap away, and nothing to edit for those
// who may not change settings.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const allowedDomains = vi.fn<(...a: unknown[]) => Promise<unknown>>()
const setAllowedDomains = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('../../lib/apiMore', async (orig) => ({
  ...(await orig<typeof import('../../lib/apiMore')>()),
  more: { allowedDomains: (...a: unknown[]) => allowedDomains(...a), setAllowedDomains: (...a: unknown[]) => setAllowedDomains(...a) },
}))
let allowed = true
vi.mock('../../lib/permissions', () => ({ can: () => allowed }))

import { AllowedDomains } from './AllowedDomains'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const site = { id: 's1', domain: 'a.com', name: 'a.com' } as never
const state = { allowed: ['old.example'], refused: [{ host: 'staging.a.dev', n: 30 }], max: 20 }
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label || b.title === label)

const type = (el: HTMLInputElement | null, value: string) => {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') as { set: (this: HTMLInputElement, v: string) => void }
  if (!el) return
  desc.set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  allowed = true
  allowedDomains.mockReset().mockResolvedValue(state)
  setAllowedDomains.mockReset().mockImplementation((_id, list) => Promise.resolve({ ...state, allowed: list, refused: [] }))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.replaceChildren()
})

describe('allowed domains', () => {
  it('adds a typed address as the server keeps it', async () => {
    act(() => root.render(<AllowedDomains site={site} />))
    await settle()
    expect(host.textContent).toContain('old.example')
    act(() => type(host.querySelector('input'), 'https://www.Staging.A.com/page'))
    act(() => button('Add')?.click())
    await settle()
    expect(setAllowedDomains).toHaveBeenCalledWith('s1', ['old.example', 'staging.a.com'])
  })

  it('allows a refused host with one tap, and removes one with its ×', async () => {
    act(() => root.render(<AllowedDomains site={site} />))
    await settle()
    act(() => button('Allow staging.a.dev')?.click())
    await settle()
    expect(setAllowedDomains).toHaveBeenCalledWith('s1', ['old.example', 'staging.a.dev'])
    act(() => button('Remove old.example')?.click())
    await settle()
    expect(setAllowedDomains).toHaveBeenLastCalledWith('s1', ['staging.a.dev'])
  })

  it('shows the list and no controls to someone who may not change settings', async () => {
    allowed = false
    act(() => root.render(<AllowedDomains site={site} />))
    await settle()
    expect(host.textContent).toContain('old.example')
    expect(host.querySelector('input')).toBeNull()
    expect(button('Remove old.example')).toBeUndefined()
    expect(button('Allow staging.a.dev')).toBeUndefined()
  })
})
