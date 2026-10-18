import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { start } from '../src/core'

// Core Web Vitals as the web-vitals library defines them, against a browser
// whose PerformanceObserver the test drives.
type Entry = Record<string, any>
type Obs = { type: string; cb: (l: { getEntries: () => Entry[] }) => void; queued: Entry[] }
let win: Window
let sent: Record<string, any>[]
let observers: Obs[]
let supported: string[]

const emit = (type: string, ...entries: Entry[]) => observers.filter((o) => o.type == type).forEach((o) => o.cb({ getEntries: () => entries }))
const setHidden = (h: boolean) => {
  Object.defineProperty(win.document, 'hidden', { value: h, configurable: true })
  win.document.dispatchEvent(new win.Event('visibilitychange'))
}
const flush = () => new Promise((r) => setTimeout(r, 0))
const lastE = () => {
  const es = sent.filter((e) => e.k == 'e')
  return es[es.length - 1]
}
const hide = async () => {
  vi.setSystemTime(Date.now() + 5000)
  setHidden(true)
  await flush()
}

function browser(opts: { hidden?: boolean } = {}) {
  win = new Window({ url: 'https://site.com/', width: 1440, height: 900 })
  Object.defineProperty(win.document, 'hidden', { value: !!opts.hidden, configurable: true, writable: true })
  class PO {
    static get supportedEntryTypes() {
      return supported
    }
    o!: Obs
    constructor(private cb: any) {}
    observe(init: { type: string; buffered: boolean }) {
      expect(init.buffered).toBe(true)
      this.o = { type: init.type, cb: this.cb, queued: [] }
      observers.push(this.o)
    }
    takeRecords() {
      const q = this.o.queued
      this.o.queued = []
      return q
    }
  }
  const defs: Record<string, unknown> = {
    window: win,
    document: win.document,
    location: win.location,
    history: win.history,
    screen: win.screen,
    localStorage: win.localStorage,
    innerHeight: 900,
    scrollY: 0,
    IntersectionObserver: undefined,
    PerformanceObserver: PO,
    navigator: { language: 'en', webdriver: false },
    fetch: vi.fn(async (_u: string, init: { body: string }) => (sent.push(JSON.parse(init.body)), { status: 202 })),
  }
  for (const [k, v] of Object.entries(defs)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
}

const open = (opts?: { hidden?: boolean }) => {
  browser(opts)
  start({ site: 'tkb_t', api: '/api/e' })
}

beforeEach(() => {
  sent = []
  observers = []
  supported = ['largest-contentful-paint', 'layout-shift', 'event']
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('web vitals', () => {
  it('reports the last LCP candidate, rounded down to the ms, when the page is hidden', async () => {
    open()
    emit('largest-contentful-paint', { startTime: 800.4 }, { startTime: 1234.6 })
    await hide()
    expect(lastE().lcp).toBe(1234)
  })

  it('reports a layout shift of 0 as 0, and nothing where the browser cannot measure it', async () => {
    open()
    await hide()
    expect(lastE().cls).toBe(0)
    sent = []
    supported = ['largest-contentful-paint']
    open()
    await hide()
    expect('cls' in lastE()).toBe(false)
  })

  it('scores layout shift as the worst session window, ignoring shifts after input', async () => {
    open()
    emit('layout-shift', { startTime: 100, value: 0.05 }, { startTime: 600, value: 0.04 }) // window one: 0.09
    emit('layout-shift', { startTime: 5000, value: 0.2, hadRecentInput: true }) // after a click: not counted
    emit('layout-shift', { startTime: 9000, value: 0.03 }, { startTime: 9500, value: 0.03 }) // window two: 0.06
    await hide()
    expect(lastE().cls).toBe(90)
  })

  it('takes the INP from interactions, not from every event, setting one slowest aside per 50', async () => {
    open()
    // pointerdown and click of one tap share an interaction id; a hover has none
    emit('event', { interactionId: 1, duration: 56 }, { interactionId: 1, duration: 120 }, { interactionId: 0, duration: 900 })
    emit('event', { interactionId: 2, duration: 300 })
    await hide()
    expect(lastE().inp).toBe(300)
    sent = []
    open()
    emit('event', { interactionId: 1, duration: 1000 })
    for (let i = 2; i <= 51; i++) emit('event', { interactionId: i, duration: 100 + i })
    await hide()
    expect(lastE().inp).toBe(151) // 51 interactions: the slowest is set aside
  })

  it('has no INP when nothing was tapped', async () => {
    open()
    await hide()
    expect('inp' in lastE()).toBe(false)
  })

  it('leaves out the LCP of a page that loaded in the background', async () => {
    open({ hidden: true })
    emit('largest-contentful-paint', { startTime: 40000 })
    setHidden(false)
    await hide()
    expect('lcp' in lastE()).toBe(false)
  })

  it('leaves out an LCP that came after the page was first hidden', async () => {
    open()
    emit('largest-contentful-paint', { startTime: 0.5 })
    await hide()
    expect(lastE().lcp).toBe(0)
    sent = []
    open()
    emit('largest-contentful-paint', { startTime: 900 })
    const at = performance.now()
    await hide()
    emit('largest-contentful-paint', { startTime: at + 60000 })
    setHidden(false)
    await hide()
    expect(lastE().lcp).toBe(900)
  })

  it('reads entries the browser had not delivered yet when the page is hidden', async () => {
    open()
    observers.find((o) => o.type == 'layout-shift')!.queued.push({ startTime: 50, value: 0.12 })
    await hide()
    expect(lastE().cls).toBe(120)
  })

  it('carries the vitals on the view the page was loaded as only', async () => {
    open()
    emit('largest-contentful-paint', { startTime: 900 })
    vi.setSystemTime(Date.now() + 5000)
    win.history.pushState({}, '', '/next') // the first view ends here, with its numbers
    await flush()
    expect(lastE().lcp).toBe(900)
    sent = []
    await hide() // the second view reports none
    expect(lastE().en).toBeGreaterThan(0)
    expect('lcp' in lastE()).toBe(false)
    expect('cls' in lastE()).toBe(false)
  })
})
