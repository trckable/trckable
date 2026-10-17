// @vitest-environment happy-dom
// "What the script records": only the choices are listed, each with its size,
// and outbound links and forms sit inside Goals.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModuleInfo } from '../lib/apiMore'

const list = vi.fn<(...a: unknown[]) => Promise<unknown>>()
const setModule = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('../lib/apiMore', async (orig) => ({
  ...(await orig<typeof import('../lib/apiMore')>()),
  api: { modules: (...a: unknown[]) => list(...a) },
  more: { setModule: (...a: unknown[]) => setModule(...a) },
}))
const ask = vi.fn<(...a: unknown[]) => Promise<boolean>>()
vi.mock('../components/Confirm', () => ({ confirm: (...a: unknown[]) => ask(...a) }))
vi.mock('../lib/me', async (orig) => ({ ...(await orig<typeof import('../lib/me')>()), canChange: () => true }))

import { ScriptRecords } from './ScriptRecords'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const m = (id: string, enabled: boolean, tracker_bytes = 0): ModuleInfo => ({ id, name: id, summary: '', collects: true, default_on: false, enabled, tracker_bytes })
const answer = (goals: boolean) => ({
  modules: [m('goals', goals, 700), m('outbound', false, 210), m('forms', true, 150), m('vitals', true, 480), m('heatmaps', false, 1500), m('funnels', true)],
  script: { bytes: 1900, core: 400, full: 3000, url: '/js/s1.js' },
})
const site = { id: 's1', domain: 'site.com' } as never

beforeEach(() => {
  list.mockReset()
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

describe('what the script records', () => {
  it('lists goals, vitals and heatmaps with their sizes, outbound and forms inside goals, and nothing without a switch', async () => {
    list.mockResolvedValue(answer(true))
    act(() => root.render(<ScriptRecords site={site} />))
    await settle()
    expect([...host.querySelectorAll('.srow-text b')].map((b) => b.textContent)).toEqual(['Goals', 'Core Web Vitals', 'Heatmaps'])
    expect(host.textContent).toContain('Adds 700 B.')
    expect(host.textContent).toContain('Adds 1.46 KB.')
    expect(host.querySelectorAll('.rec-sub input[type="checkbox"]')).toHaveLength(2)
    expect(host.textContent).toContain('Script 1.86 KB')
    expect(host.textContent).not.toMatch(/funnel/i)
  })

  it('a switch changes the module and shows the answer', async () => {
    list.mockResolvedValue(answer(true))
    setModule.mockResolvedValue(answer(true))
    act(() => root.render(<ScriptRecords site={site} />))
    await settle()
    act(() => host.querySelectorAll<HTMLElement>('[role="switch"]')[2].click())
    await settle()
    expect(setModule).toHaveBeenCalledWith('s1', 'heatmaps', true)
  })

  it('outbound and forms wait for goals', async () => {
    list.mockResolvedValue(answer(false))
    act(() => root.render(<ScriptRecords site={site} />))
    await settle()
    for (const box of host.querySelectorAll<HTMLInputElement>('.rec-sub input')) expect(box.disabled).toBe(true)
  })
})

describe('turning a choice off', () => {
  it('asks first, says what stops, and does nothing when declined', async () => {
    list.mockResolvedValue(answer(true))
    setModule.mockResolvedValue(answer(true))
    ask.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    act(() => root.render(<ScriptRecords site={site} />))
    await settle()
    const vitals = host.querySelectorAll<HTMLElement>('[role="switch"]')[1]
    act(() => vitals.click())
    await settle()
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Turn off vitals?', danger: true, body: expect.stringContaining('Nothing already recorded is deleted.') as string }))
    expect(setModule).not.toHaveBeenCalled()
    act(() => vitals.click())
    await settle()
    expect(setModule).toHaveBeenCalledWith('s1', 'vitals', false)
  })

  it('turning one on needs no question', async () => {
    list.mockResolvedValue(answer(true))
    setModule.mockResolvedValue(answer(true))
    act(() => root.render(<ScriptRecords site={site} />))
    await settle()
    act(() => host.querySelectorAll<HTMLElement>('[role="switch"]')[2].click())
    await settle()
    expect(ask).not.toHaveBeenCalled()
    expect(setModule).toHaveBeenCalledWith('s1', 'heatmaps', true)
  })
})
