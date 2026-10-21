// @vitest-environment happy-dom
// Switching something on (a write to the site's modules or Answers) makes the cards read their figures again, with no reload.
import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../lib/api'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const state = vi.hoisted(() => ({ recorded: false, reads: 0 }))
vi.mock('../../features/extras/quiet', () => ({ whenQuiet: (f: () => void) => (f(), () => undefined) }))
vi.mock('../briefing/moduleOn', () => ({ moduleOn: () => Promise.resolve(state.recorded) }))
vi.mock('../../lib/apiMore', () => ({
  more: {
    vitals: () => Promise.resolve({}),
    crawlers: () => {
      state.reads++
      return Promise.resolve({ hits: 0, engines: [] })
    },
  },
}))
vi.mock('../../features/incidents/api', () => ({ incidents: { period: () => Promise.resolve({ incidents: [] }) } }))
vi.mock('../../features/answers/api', () => ({ answersApi: { report: () => Promise.resolve({ latest: null }) } }))
vi.mock('../../features/mentions/api', () => ({ mentionsApi: { list: () => Promise.resolve({ mentions: [] }) } }))
vi.mock('./health', async (orig) => ({ ...(await orig<typeof import('./health')>()), speedOf: () => null, aiOf: () => null }))

import { announceSiteWrite } from '../../lib/siteWrites'
import { useHealth, type Health } from './useHealth'

const site = { id: 's1', timezone: 'UTC' } as Site
const seen: { now: Health } = { now: {} }
const Probe = () => {
  const h = useHealth(site, true)
  useEffect(() => {
    seen.now = h
  })
  return null
}
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})

afterEach(() => {
  state.reads = 0
  state.recorded = false
})

describe('the health cards after something is switched on', () => {
  it('read again at once when the site\'s modules are written, and show the new state', async () => {
    const root = createRoot(document.createElement('div'))
    act(() => {
      root.render(createElement(Probe))
    })
    await flush()
    expect(state.reads).toBe(1)
    expect(seen.now.vitalsOn).toBe(false)

    state.recorded = true
    act(() => {
      announceSiteWrite('/sites/s1/modules/vitals')
    })
    await flush()
    expect(state.reads).toBe(2)
    expect(seen.now.vitalsOn).toBe(true)

    act(() => {
      announceSiteWrite('/sites/other/modules/vitals') // another site: nothing to read
    })
    await flush()
    expect(state.reads).toBe(2)
    act(() => {
      root.unmount()
    })
  })
})
