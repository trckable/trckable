// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fmtInt } from '../../lib/format'
import type { LiveNow } from '../../features/live/api'
import { LiveView, type LiveFeed } from './LiveView'
import type { LiveStream } from './Live'

const NOW = 1_800_000_000_000
const data: LiveNow = {
  at: NOW,
  start: NOW - 29 * 60_000,
  minutes: Array.from({ length: 30 }, () => 1),
  online: 4217,
  visitors: 5000,
  previous: 4000,
  sources: [],
  recent: [],
  today: { visitors: 132, before: 100, compare: true, hours: [], last: [] },
}
const stream: LiveStream = { online: 4217, at: NOW, visits: [], sales: [], connected: true, stale: false }
const feed = (down?: number): LiveFeed => ({ data, failed: false, got: NOW, clock: NOW, skew: 0, busier: null, downSince: down })
const draw = (f: LiveFeed) => {
  const box = document.createElement('div')
  act(() => createRoot(box).render(createElement(LiveView, { feed: f, site: 's', timezone: 'UTC', stream })))
  return box
}
// A rolling figure keeps its value once as text and once as the digits that slide; the text is the one to count.
const figures = (box: HTMLElement, text: string) => [...box.querySelectorAll('.rn-text')].filter((e) => e.textContent === text).length

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Live says each number once', () => {
  // No request may leave the test: any fetch a hook makes stays pending.
  beforeAll(() => vi.stubGlobal('fetch', () => new Promise(() => {})))
  afterAll(() => vi.unstubAllGlobals())
  it('tells the people on the site now once: in the card, not again in the list header', () => {
    expect(figures(draw(feed()), fmtInt(4217))).toBe(1)
  })
  it('tells today once, in the card, and not in the Analytics card', () => {
    const html = draw(feed()).innerHTML
    expect(html.split('Today 132 people').length - 1).toBe(1)
    expect(html).toContain('lusual')
  })
  it('shows one box for a site that is down', () => {
    expect(draw(feed(NOW / 1000 - 600)).innerHTML.split('downbox').length - 1).toBe(1)
  })
})
