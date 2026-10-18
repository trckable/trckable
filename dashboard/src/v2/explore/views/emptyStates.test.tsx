// @vitest-environment happy-dom
// Explore with nothing collected: what has no switch shows a line, and what
// needs a connection (payments, Search Console, goals) shows the one step.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const retention = vi.fn<(...a: unknown[]) => Promise<unknown>>()
vi.mock('../../../lib/apiMore', async (orig) => ({ ...(await orig<typeof import('../../../lib/apiMore')>()), more: { retention: (...a: unknown[]) => retention(...a) } }))

import { deepCopy } from '../../../features/cards/deepCopy'
import type { XCtx } from '../ctx'
import { XRetention } from './hosted/Retention'
import { kitLater } from '../../../charts/kitLater'
import { Lock } from './Lock'
import { Results } from './Results'
import XCharts from './hosted/Charts'
import { copy } from '../copy'
import { setRole } from '../../../lib/me'
import { lockCopy } from '../../ui/lockCopy'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const connect = vi.fn()
const x = { site: { id: 's1', domain: 'site.com' }, connect, how: vi.fn() } as unknown as XCtx

beforeEach(() => {
  retention.mockReset()
  connect.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('what needs a connection shows the one step', () => {
  beforeEach(() => setRole('owner'))

  it.each(['rev', 'search', 'goals'] as const)('%s: a button that starts it', (k) => {
    act(() => root.render(<Lock k={k} x={x} />))
    const go = [...host.querySelectorAll('button')].find((b) => !/how/i.test(b.textContent ?? ''))
    expect(go).toBeDefined()
    act(() => go?.click())
    expect(connect).toHaveBeenCalledWith(k)
  })
})

describe('what has no switch says so when nothing is there', () => {
  it('retention: one line when there is not enough history', async () => {
    retention.mockResolvedValue({ weeks: [], size: [], returned: [] })
    act(() => root.render(<XRetention x={x} query={{ from: '2026-09-07', to: '2026-09-13' }} />))
    await settle()
    expect(host.textContent).toContain(deepCopy.retention.none)
  })

  it.each(['rev', 'search', 'goals'] as const)('%s: a viewer sees the card and is asked to turn to an Owner or Admin', (k) => {
    setRole('viewer')
    act(() => root.render(<Lock k={k} x={x} />))
    expect(host.textContent).toContain(lockCopy.ask)
    expect([...host.querySelectorAll('button')].filter((b) => !/how/i.test(b.textContent ?? ''))).toHaveLength(0)
  })

  it('funnels: a viewer sees the empty state and the ask line, and no Track a goal button', () => {
    setRole('viewer')
    const d = { steps: [], leak: { at: -1, r: 0, ur: 0 }, goals: [], vs: '', ghost: false, goalsOn: true, pages: [] }
    const ctx = { ...x, custom: { steps: [], goals: [] }, edit: false, setEdit: vi.fn() } as unknown as XCtx
    act(() => root.render(<Results x={ctx} d={d} />))
    expect(host.textContent).toContain(copy.emptyFunnel)
    expect(host.textContent).toContain(lockCopy.ask)
    expect(host.querySelector('#xTrack')).toBeNull()
  })

  it('funnels: a line, and goals the one step to set them up', () => {
    setRole('owner')
    const d = { steps: [], leak: { at: -1, r: 0, ur: 0 }, goals: [], vs: '', ghost: false, goalsOn: false, pages: [] }
    const ctx = { ...x, custom: { steps: [], goals: [] }, edit: false, setEdit: vi.fn() } as unknown as XCtx
    act(() => root.render(<Results x={ctx} d={d} />))
    expect(host.textContent).toContain(copy.emptyFunnel)
    const go = [...host.querySelectorAll('button')].find((b) => !/how|edit/i.test(b.textContent ?? '') && b.className !== 'xb')
    act(() => go?.click())
    expect(connect).toHaveBeenCalledWith('goals')
  })

  it('map: no country has paid, and the chart says so', () => {
    const report = { current: { revenue_dims: { country: [] } } } as never
    act(() => root.render(<XCharts tab="revenue-map" x={x} report={report} query={{ from: '2026-09-07', to: '2026-09-13' }} />))
    expect(host.textContent).toContain(kitLater.empty)
  })
})
