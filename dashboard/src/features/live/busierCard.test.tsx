// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/url', () => ({ setView: vi.fn() }))
vi.mock('../signals/useFullSurge', () => ({ useFullSurge: (given: unknown) => ({ surge: given, state: 'ready' }) }))

import type { Busier } from './api'
import { BusierLine } from './BusierLine'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const busier: Busier = {
  now: 31,
  baseline: true,
  usual: 19,
  low: 15,
  high: 23,
  state: 'busier',
  since: 1_791_000_000,
  rest: 1,
  why: [
    { dim: 'source', value: 'Facebook', now: 20, usual: 5, plus: 15 },
    { dim: 'page', value: '/news/a-very-long-path', now: 15, usual: 1, plus: 14 },
  ],
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const dialog = () => document.body.querySelector('[role="dialog"]')
const open = async (selector: string) => {
  await act(() => {
    root.render(<BusierLine busier={busier} site="s1" timezone="UTC" />)
    return Promise.resolve()
  })
  expect(dialog()).toBeNull()
  act(() => host.querySelector<HTMLButtonElement>(selector)?.click())
  // The card is a lazy chunk: on a cold cache or a busy machine its first transform takes seconds.
  for (let i = 0; i < 400 && !dialog(); i++) await act(() => new Promise((r) => setTimeout(r, 25)))
}

describe('the busy line opens the busy-moment card', () => {
  it.each([['.live-busier-why'], ['.live-busier-parts']])('from %s, with the path as a chip and not in the line', async (selector) => {
    await open(selector)
    expect(dialog()?.textContent).toContain('31')
    expect(dialog()?.querySelector('.sg-chip, .sgm-landing')).not.toBeNull()
    expect(host.querySelector('.live-busier-parts')?.textContent).not.toContain('/news')
  }, 20_000)
})
