// The cookie-banner module, built in (__CONSENT__). Until the visitor agrees,
// the script must behave exactly like consent-free mode — no cookie, nothing
// in storage — and it must let go again the moment they change their mind.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { start, type Config } from '../src/core'

type Sent = Record<string, any>

let win: Window
let sent: Sent[]

function browser(url = 'https://site.com/') {
  win = new Window({ url, width: 1440, height: 900 })
  Object.defineProperty(win.document, 'referrer', { value: '', configurable: true })
  const g = globalThis as any
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
    navigator: { language: 'en-GB', webdriver: false },
    fetch: vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body))
      return { status: 202 }
    }),
  }
  for (const [k, v] of Object.entries(defs)) Object.defineProperty(g, k, { value: v, configurable: true, writable: true })
}

const tracker = (c: Partial<Config> = {}) => start({ site: 'tkb_test', api: 'https://stats.site.com/api/e', ...c })
const flush = () => new Promise((r) => setTimeout(r, 0))
const last = () => sent[sent.length - 1]

beforeEach(() => {
  sent = []
  browser()
})
afterEach(() => vi.restoreAllMocks())

it('counts the visit without a cookie until someone agrees', async () => {
  tracker()
  await flush()
  expect(last()).toMatchObject({ k: 'pv', c: 1 })
  expect(last().v).toBeUndefined()
  expect(win.document.cookie).toBe('')
  expect(win.localStorage.getItem('trckable_q')).toBe(null)
})

it('starts the cookie when Google Consent Mode grants analytics storage', async () => {
  const t = tracker()
  await flush()
  ;(win as any).dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }])
  t('pageview')
  await flush()
  expect(last().c).toBeUndefined()
  expect(last().v).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/)
  expect(win.document.cookie).toContain('trckable_vid=')
})

it('reads a grant the banner pushed before the script loaded', async () => {
  ;(win as any).dataLayer = [['consent', 'default', { analytics_storage: 'granted' }]]
  tracker()
  await flush()
  expect(last().c).toBeUndefined()
  expect(last().v).toBeTruthy()
})

it('deletes the cookie when consent is withdrawn', async () => {
  const t = tracker()
  await flush()
  ;(win as any).dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }])
  t('pageview')
  await flush()
  expect(win.document.cookie).toContain('trckable_vid=')
  ;(win as any).dataLayer.push(['consent', 'update', { analytics_storage: 'denied' }])
  t('pageview')
  await flush()
  expect(win.document.cookie).toBe('')
  expect(last()).toMatchObject({ c: 1 })
  expect(last().v).toBeUndefined()
})

it('withdrawn consent also empties the queued page views, and says so to the server', async () => {
  browser('https://www.site.com/')
  const t = tracker()
  await flush()
  ;(win as any).dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }])
  win.localStorage.setItem('trckable_q', '[[{"k":"pv","u":"https://www.site.com/secret"},1]]')
  t('pageview')
  await flush()
  ;(win as any).dataLayer.push(['consent', 'update', { analytics_storage: 'denied' }])
  t('pageview')
  await flush()
  expect(win.document.cookie).toBe('')
  expect(win.localStorage.getItem('trckable_q')).toBeNull()
  expect(last()).toMatchObject({ c: 1 }) // the server expires any cookie it set (ingest: forget)
})

it('keeps reading the dataLayer after a tag manager replaces push', async () => {
  const t = tracker()
  await flush()
  const dl = (win as any).dataLayer
  const real = dl.push.bind(dl)
  dl.push = (...a: any[]) => real(...a) // what GTM does to the array it shares
  dl.push(['consent', 'update', { analytics_storage: 'granted' }])
  t('pageview')
  await flush()
  expect(last().v).toBeTruthy()
})

it('follows IAB TCF: purposes 1 and 8 together', async () => {
  let fire: (t: any, ok: boolean) => void = () => {}
  ;(win as any).__tcfapi = (cmd: string, _v: number, cb: any) => {
    if (cmd === 'addEventListener') fire = cb
  }
  const t = tracker()
  await flush()
  fire({ gdprApplies: true, purpose: { consents: { 1: true, 8: false } } }, true)
  t('pageview')
  await flush()
  expect(last()).toMatchObject({ c: 1 })
  fire({ gdprApplies: true, purpose: { consents: { 1: true, 8: true } } }, true)
  t('pageview')
  await flush()
  expect(last().v).toBeTruthy()
})

it('still answers trckable("consent", true) for banners that speak neither standard', async () => {
  const t = tracker()
  await flush()
  t('consent', true)
  t('pageview')
  await flush()
  expect(last().v).toBeTruthy()
})
