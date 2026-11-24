// @vitest-environment happy-dom
// No request may leave the test, now or later, not even from a module that asks while it loads (imports run first, so
// the stubs are hoisted above them) or from a timer that fires after the last test. Every way out is stubbed.
vi.hoisted(() => {
  const never = () => new Promise<never>(() => {})
  vi.stubGlobal('fetch', never)
  vi.stubGlobal('XMLHttpRequest', class { open() {} send() {} abort() {} setRequestHeader() {} addEventListener() {} removeEventListener() {} })
  vi.stubGlobal('EventSource', class { close() {} addEventListener() {} removeEventListener() {} })
  Object.defineProperty(navigator, 'sendBeacon', { value: () => true, configurable: true })
})
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, describe, expect, it, vi } from 'vitest'
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
// No request may leave the test, now or later: a timer a hook set can fire after the last test, so the stubs stay for
// the whole file (each file has its own environment). Every way out is stubbed: fetch, XHR, EventSource, sendBeacon.
const roots: ReturnType<typeof createRoot>[] = []
afterAll(() => act(() => roots.forEach((r) => r.unmount())))
const draw = (f: LiveFeed) => {
  const box = document.createElement('div')
  const root = createRoot(box)
  roots.push(root)
  act(() => root.render(createElement(LiveView, { feed: f, site: 's', timezone: 'UTC', stream })))
  return box
}
// A rolling figure keeps its value once as text and once as the digits that slide; the text is the one to count.
const figures = (box: HTMLElement, text: string) => [...box.querySelectorAll('.rn-text')].filter((e) => e.textContent === text).length

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Live says each number once', () => {
  it('tells the people on the site now once: in the card, not again in the list header', () => {
    expect(figures(draw(feed()), fmtInt(4217))).toBe(1)
  })
  it('tells today once, in the card, and not in the Analytics card', () => {
    const box = draw(feed())
    expect(figures(box, fmtInt(132))).toBe(1)
    expect(box.querySelectorAll('.lfig .ltoday').length).toBe(1)
  })
  it('shows one box for a site that is down', () => {
    expect(draw(feed(NOW / 1000 - 600)).innerHTML.split('downbox').length - 1).toBe(1)
  })
})
