// @vitest-environment happy-dom
// Changing a domain: only whoever may change settings is offered it, the old
// address is listed with a way to stop now, and nothing changes before the confirm step.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const siteDomain = vi.fn<(...a: unknown[]) => Promise<unknown>>()
const changeDomain = vi.fn<(...a: unknown[]) => Promise<unknown>>()
const endFormerDomain = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('../../lib/apiMore', async (orig) => ({
  ...(await orig<typeof import('../../lib/apiMore')>()),
  more: { siteDomain: (...a: unknown[]) => siteDomain(...a), changeDomain: (...a: unknown[]) => changeDomain(...a), endFormerDomain: (...a: unknown[]) => endFormerDomain(...a) },
}))
let allowed = true
vi.mock('../../lib/permissions', () => ({ can: () => allowed }))

import { DomainRow } from './DomainRow'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const site = { id: 's1', domain: 'old.com', name: 'old.com' } as never
const until = Math.floor(Date.UTC(2026, 10, 20) / 1000)
const state = { domain: 'old.com', former: [{ host: 'older.com', until, changed_at: 1 }], grace_days: 30 }
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)

// React listens for the input event, so the value is set the way the browser sets it.
const type = (el: HTMLInputElement | null, value: string) => {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') as { set: (this: HTMLInputElement, v: string) => void }
  if (!el) return
  desc.set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  allowed = true
  siteDomain.mockReset().mockResolvedValue(state)
  changeDomain.mockReset()
  endFormerDomain.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.querySelectorAll('[role=dialog]').forEach((d) => d.remove())
})

describe('the domain row', () => {
  it('shows the domain and the old address until its date, and stops it on a click', async () => {
    endFormerDomain.mockResolvedValue({ ...state, former: [] })
    act(() => root.render(<DomainRow site={site} onSaved={vi.fn()} />))
    await settle()
    expect(host.textContent).toContain('old.com')
    expect(host.textContent).toContain('Also accepting older.com until Nov 20, 2026')
    act(() => button('Stop now')?.click())
    await settle()
    expect(endFormerDomain).toHaveBeenCalledWith('s1', 'older.com')
    expect(host.textContent).not.toContain('Also accepting')
  })

  it('offers no change to someone who may not change settings', async () => {
    allowed = false
    act(() => root.render(<DomainRow site={site} onSaved={vi.fn()} />))
    await settle()
    expect(button('Change')).toBeUndefined()
    expect(button('Stop now')).toBeUndefined()
  })

  it('says plainly when the Search Console property is not the domain', async () => {
    siteDomain.mockResolvedValue({ ...state, former: [], search: { property: 'sc-domain:gone.com', matches: false } })
    act(() => root.render(<DomainRow site={site} onSaved={vi.fn()} />))
    await settle()
    expect(host.textContent).toContain('Search Console is connected to sc-domain:gone.com, which is not old.com')
  })

  it('lists what changes and changes nothing until confirmed', async () => {
    const onSaved = vi.fn()
    changeDomain.mockResolvedValue({ ...state, domain: 'new.com' })
    act(() => root.render(<DomainRow site={site} onSaved={onSaved} />))
    await settle()
    act(() => button('Change')?.click())
    const input = document.body.querySelector<HTMLInputElement>('input.input')
    expect(input).not.toBeNull()
    siteDomain.mockResolvedValue({ ...state, preview: { domain: 'new.com' } })
    act(() => {
      type(input, 'https://New.com/')
    })
    act(() => button('Continue')?.click())
    await settle()
    expect(siteDomain).toHaveBeenLastCalledWith('s1', 'https://New.com/')
    expect(document.body.textContent).toContain('Change old.com to new.com?')
    expect(document.body.textContent).toContain('uptime check, the status page and share links use new.com')
    expect(changeDomain).not.toHaveBeenCalled()
    act(() => button('Change domain')?.click())
    await settle()
    expect(changeDomain).toHaveBeenCalledWith('s1', 'new.com')
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows the reason a domain is refused and stays on the first step', async () => {
    act(() => root.render(<DomainRow site={site} onSaved={vi.fn()} />))
    await settle()
    act(() => button('Change')?.click())
    const input = document.body.querySelector<HTMLInputElement>('input.input')
    siteDomain.mockRejectedValue(new Error('you already have that site'))
    act(() => {
      type(input, 'taken.com')
    })
    act(() => button('Continue')?.click())
    await settle()
    expect(document.body.textContent).toContain('you already have that site')
    expect(changeDomain).not.toHaveBeenCalled()
  })
})
