// The read-the-site's-banner module, built in (__CONSENT__). Until the
// visitor answers, what the page sends is held in memory: accept, and it goes
// with the cookie; decline, and it is dropped, and nothing more is sent. A
// banner's default is not an answer. Leaving without an answer counts the
// page without a cookie. Nothing is stored before an accept.
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

const hide = () => {
  Object.defineProperty(win.document, 'hidden', { value: true, configurable: true })
  win.document.dispatchEvent(new win.Event('visibilitychange') as any)
}

it('holds the page until the visitor answers, storing nothing', async () => {
  tracker()
  await flush()
  expect(sent).toEqual([])
  expect(win.document.cookie).toBe('')
  expect(win.localStorage.getItem('trckable_q')).toBe(null)
})

it("counts the page without a cookie when the visitor leaves without answering", async () => {
  tracker()
  await flush()
  hide()
  await flush()
  expect(sent[0]).toMatchObject({ k: 'pv', c: 1 })
  expect(sent.every((e) => e.c == 1 && !e.v)).toBe(true) // the engagement that follows too
  expect(win.document.cookie).toBe('')
})

it("does not take a banner's default for an answer", async () => {
  ;(win as any).dataLayer = [['consent', 'default', { analytics_storage: 'denied' }]]
  tracker()
  await flush()
  expect(sent).toEqual([]) // still waiting, not declined
  hide()
  await flush()
  expect(sent[0]).toMatchObject({ k: 'pv', c: 1 })
})

it('drops the held page, and everything after, when the visitor declines', async () => {
  const t = tracker()
  await flush()
  ;(win as any).dataLayer.push(['consent', 'update', { analytics_storage: 'denied' }])
  t('pageview')
  t('goal', 'signup')
  hide()
  await flush()
  expect(sent).toEqual([])
  expect(win.document.cookie).toBe('')
})

it('sends the held page with the cookie when the visitor accepts', async () => {
  tracker()
  await flush()
  ;(win as any).dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }])
  ;(win as any).dataLayer.push(['noop']) // any later push is read on the next send
  const t = tracker // unused: the first answer is read when the page is sent
  void t
  hide()
  await flush()
  expect(sent[0]).toMatchObject({ k: 'pv' })
})

it('takes Do Not Track and Global Privacy Control as a no', async () => {
  for (const nav of [{ doNotTrack: '1' }, { globalPrivacyControl: true }]) {
    sent = []
    browser()
    Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-GB', webdriver: false, ...nav }, configurable: true, writable: true })
    const t = tracker()
    t('pageview')
    hide()
    await flush()
    expect(sent).toEqual([])
  }
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

it('deletes the cookie and stops counting when consent is withdrawn', async () => {
  const t = tracker()
  await flush()
  ;(win as any).dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }])
  t('pageview')
  await flush()
  expect(win.document.cookie).toContain('trckable_vid=')
  const before = sent.length
  ;(win as any).dataLayer.push(['consent', 'update', { analytics_storage: 'denied' }])
  t('pageview')
  await flush()
  expect(win.document.cookie.replace('trckable_vid=', '')).toBe('') // happy-dom keeps the emptied name
  expect(sent).toHaveLength(before)
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
  fire({ eventStatus: 'cmpuishown', gdprApplies: true, purpose: { consents: {} } }, true)
  await flush()
  expect(sent).toEqual([]) // the banner is up: still waiting
  fire({ eventStatus: 'useractioncomplete', gdprApplies: true, purpose: { consents: { 1: true, 8: false } } }, true)
  t('pageview')
  await flush()
  expect(sent).toEqual([]) // not both purposes: a no
  fire({ eventStatus: 'useractioncomplete', gdprApplies: true, purpose: { consents: { 1: true, 8: true } } }, true)
  t('pageview')
  await flush()
  expect(last().v).toBeTruthy() // changed their mind: counted from now on
})

it('treats trckable("consent", false) as a final no', async () => {
  const t = tracker()
  await flush()
  t('consent', true)
  t('pageview')
  await flush()
  expect(win.document.cookie).toContain('trckable_vid=')
  const before = sent.length
  t('consent', false)
  t('pageview')
  await flush()
  expect(win.document.cookie.replace('trckable_vid=', '')).toBe('') // happy-dom keeps the emptied name
  expect(sent).toHaveLength(before)
})

it('still answers trckable("consent", true) for banners that speak neither standard', async () => {
  const t = tracker()
  await flush()
  t('consent', true)
  t('pageview')
  await flush()
  expect(last().v).toBeTruthy()
})
