// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeatAsk } from './api'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted((): { reply: HeatAsk | Error } => ({ reply: { ask: true } }))
const ask = vi.hoisted(() =>
  vi.fn(() => (h.reply instanceof Error ? Promise.reject(h.reply) : Promise.resolve(h.reply))),
)
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), heatApi: { ask, map: vi.fn() } }))
vi.mock('../extras/quiet', () => ({ whenQuiet: (fn: () => void) => (fn(), () => undefined) }))

import { heatDone, markHeatDone, useHeatAsk } from './guide'

let seen: (HeatAsk | null)[] = []
function Probe({ site, enabled }: { site: string; enabled: boolean }) {
  seen.push(useHeatAsk(site, enabled))
  return null
}
const run = async (site: string, enabled: boolean) => {
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => root.render(createElement(Probe, { site, enabled })))
  await act(async () => {
    await Promise.resolve()
  })
  act(() => root.unmount())
}

beforeEach(() => {
  localStorage.clear()
  ask.mockClear()
  seen = []
  h.reply = { ask: true, path: '/pricing', views: 134 }
})
afterEach(() => localStorage.clear())

describe('the heatmaps suggestion', () => {
  it('asks the server once the page is quiet, and passes on what it says', async () => {
    await run('s1', true)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(seen.at(-1)).toEqual({ ask: true, path: '/pricing', views: 134 })
  })

  it('does not ask when there is something else to say', async () => {
    await run('s1', false)
    expect(ask).not.toHaveBeenCalled()
    expect(seen.at(-1)).toBeNull()
  })

  it('is no after a failure: never nag on a guess', async () => {
    h.reply = new Error('offline')
    await run('s1', true)
    expect(seen.at(-1)).toEqual({ ask: false })
  })

  it('never comes back once it was put away, for that site only, and does not even ask', async () => {
    expect(heatDone('s1')).toBe(false)
    markHeatDone('s1')
    expect(heatDone('s1')).toBe(true)
    expect(heatDone('s2')).toBe(false)
    await run('s1', true)
    expect(ask).not.toHaveBeenCalled()
    expect(seen.at(-1)).toEqual({ ask: false })
    await run('s2', true)
    expect(ask).toHaveBeenCalledTimes(1)
  })
})
