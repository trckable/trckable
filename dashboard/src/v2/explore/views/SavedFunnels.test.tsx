// @vitest-environment happy-dom
// The funnels a site keeps by name: anyone opens one, whoever may change things saves, renames and deletes.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  funnels: vi.fn(),
  saveFunnel: vi.fn(),
  updateFunnel: vi.fn(),
  deleteFunnel: vi.fn(),
}))
vi.mock('../../../lib/apiMore', async (orig) => ({ ...(await orig<typeof import('../../../lib/apiMore')>()), more: api }))
const setView = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/url', async (orig) => ({ ...(await orig<typeof import('../../../lib/url')>()), setView }))

import { setRole } from '../../../lib/me'
import { copy } from '../copy'
import { SavedFunnels } from './SavedFunnels'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const spec = [{ kind: 'page' as const, value: '/pricing' }, { kind: 'goal' as const, value: 'signup' }]
const saved = { id: 'fn_1', name: 'Signup', steps: spec, created_at: 1, updated_at: 1 }
let root: Root
let host: HTMLDivElement
const submit = () =>
  act(() => {
    host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const show = async (steps = spec) => {
  act(() => root.render(<SavedFunnels site="s1" spec={steps} />))
  await settle()
}
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text)

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  setView.mockReset()
  api.funnels.mockResolvedValue({ funnels: [], max: 20 })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('saved funnels', () => {
  it('shows nothing to a viewer when the site keeps none', async () => {
    setRole('viewer')
    await show()
    expect(host.innerHTML).toBe('')
  })

  it('lets a viewer open one, and offers no change', async () => {
    setRole('viewer')
    api.funnels.mockResolvedValue({ funnels: [saved], max: 20 })
    await show([{ kind: 'page', value: '/' }, { kind: 'page', value: '/x' }])
    const pick = host.querySelector('select') as HTMLSelectElement
    expect([...pick.options].map((o) => o.textContent)).toEqual([copy.openSaved, 'Signup'])
    act(() => {
      pick.value = 'fn_1'
      pick.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(setView).toHaveBeenCalledWith({ funnel: spec })
    expect(host.querySelectorAll('button')).toHaveLength(0)
  })

  it('saves the funnel on screen under a name, and the picker then has it', async () => {
    setRole('owner')
    api.saveFunnel.mockResolvedValue(saved)
    await show()
    act(() => button(copy.saveFunnel)?.click())
    const input = host.querySelector('input') as HTMLInputElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ' Signup ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    submit()
    await settle()
    expect(api.saveFunnel).toHaveBeenCalledWith('s1', 'Signup', spec)
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('fn_1')
  })

  it('renames the open one, and deletes it only after a second tap', async () => {
    setRole('owner')
    api.funnels.mockResolvedValue({ funnels: [saved], max: 20 })
    api.updateFunnel.mockResolvedValue({ ...saved, name: 'Checkout' })
    api.deleteFunnel.mockResolvedValue(undefined)
    await show()
    expect(button(copy.saveFunnel)).toBeUndefined() // it is saved already
    act(() => button(copy.renameFunnel)?.click())
    const input = host.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('Signup')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Checkout')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    submit()
    await settle()
    expect(api.updateFunnel).toHaveBeenCalledWith('s1', 'fn_1', { name: 'Checkout' })
    act(() => button(copy.deleteFunnel)?.click())
    expect(api.deleteFunnel).not.toHaveBeenCalled()
    expect(host.textContent).toContain(copy.confirmDelete('Checkout'))
    act(() => button(copy.deleteFunnel)?.click())
    await settle()
    expect(api.deleteFunnel).toHaveBeenCalledWith('s1', 'fn_1')
  })
})
