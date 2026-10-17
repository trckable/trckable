// @vitest-environment happy-dom
// Cookie consent while it is off: the button asks first, and only a yes turns it on.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setModule = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('../lib/apiMore', async (orig) => ({ ...(await orig<typeof import('../lib/apiMore')>()), more: { setModule: (...a: unknown[]) => setModule(...a) } }))
const ask = vi.fn<(...a: unknown[]) => Promise<boolean>>()
vi.mock('../components/Confirm', () => ({ confirm: (...a: unknown[]) => ask(...a) }))
vi.mock('../lib/me', async (orig) => ({ ...(await orig<typeof import('../lib/me')>()), canChange: () => true }))

import { ConsentOff } from './ConsentOff'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const site = { id: 's1', domain: 'site.com' } as never

beforeEach(() => {
  setModule.mockReset()
  ask.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('turning cookie consent on', () => {
  it('asks first and says what changes; a no leaves it off', async () => {
    ask.mockResolvedValue(false)
    const onOn = vi.fn()
    act(() => root.render(<ConsentOff site={site} onOn={onOn} />))
    act(() => host.querySelector<HTMLElement>('button.btn')?.click())
    await settle()
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('not counted at all') as string }))
    expect(setModule).not.toHaveBeenCalled()
    expect(onOn).not.toHaveBeenCalled()
  })

  it('a yes turns it on', async () => {
    ask.mockResolvedValue(true)
    setModule.mockResolvedValue({})
    const onOn = vi.fn()
    act(() => root.render(<ConsentOff site={site} onOn={onOn} />))
    act(() => host.querySelector<HTMLElement>('button.btn')?.click())
    await settle()
    expect(setModule).toHaveBeenCalledWith('s1', 'consent', true)
    expect(onOn).toHaveBeenCalled()
  })
})
