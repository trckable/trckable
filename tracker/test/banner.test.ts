// trckable's own cookie bar (__BANNER__). It asks about one cookie, refusing
// is as easy as agreeing, and an answer survives the next page — a refusal
// that is forgotten is not a refusal.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { start, type Config } from '../src/core'

type Sent = Record<string, any>

let win: Window
let sent: Sent[]

function browser(nav: Record<string, unknown> = {}) {
  win = new Window({ url: 'https://site.com/', width: 1440, height: 900 })
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
    navigator: { language: 'en-GB', webdriver: false, ...nav },
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
const bar = () => (win.document.body.lastElementChild as any)?.shadowRoot?.querySelector('div') ?? null
const button = (i: number) => bar()!.querySelectorAll('button')[i] as any

beforeEach(() => {
  sent = []
  browser()
})
afterEach(() => vi.restoreAllMocks())

const hide = () => {
  Object.defineProperty(win.document, 'hidden', { value: true, configurable: true })
  win.document.dispatchEvent(new win.Event('visibilitychange') as any)
}

it('asks, and holds the page until the visitor answers', async () => {
  tracker()
  await flush()
  expect(bar()).not.toBe(null)
  expect(sent).toEqual([])
  expect(win.document.cookie).toBe('')
})

it('counts the page without a cookie if the visitor leaves without answering', async () => {
  tracker()
  await flush()
  hide()
  await flush()
  expect(sent[0]).toMatchObject({ k: 'pv', c: 1 })
  expect(win.document.cookie).toBe('')
})

it('offers refusing and agreeing as one click each', () => {
  tracker()
  expect(button(0).textContent).toBe('Decline')
  expect(button(1).textContent).toBe('Accept')
  expect(bar()!.getAttribute('role')).toBe('dialog')
})

it('starts the cookie when someone agrees, and remembers it next page', async () => {
  const t = tracker()
  await flush()
  button(1).click()
  t('pageview')
  await flush()
  expect(bar()).toBe(null)
  expect(last().v).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/)
  expect(win.document.cookie).toContain('trckable_vid=')

  sent = []
  tracker() // a second page load
  await flush()
  expect(bar()).toBe(null)
  expect(last().c).toBeUndefined()
})

it('does not ask again after a refusal, and stores nothing else', async () => {
  const t = tracker()
  await flush()
  button(0).click()
  t('pageview')
  hide()
  await flush()
  expect(bar()).toBe(null)
  expect(sent).toEqual([]) // a visitor who declines is not counted at all
  expect(win.document.cookie).toBe('')
  expect(win.localStorage.getItem('trckable_q')).toBe(null)
  expect(win.localStorage.getItem('trckable_c')).toBe('0')

  browser()
  win.localStorage.setItem('trckable_c', '0') // the answer, kept for the next page
  tracker()
  hide()
  await flush()
  expect(bar()).toBe(null)
  expect(sent).toEqual([])
})

it('never asks a browser that already said do not track', async () => {
  browser({ doNotTrack: '1' })
  tracker()
  hide()
  await flush()
  expect(bar()).toBe(null)
  expect(sent).toEqual([]) // an answer, and it is no
})

it('takes Global Privacy Control as the same answer', async () => {
  browser({ globalPrivacyControl: true })
  tracker()
  hide()
  await flush()
  expect(bar()).toBe(null)
  expect(sent).toEqual([]) // an answer, and it is no
})

it('says what the site tells it to say, in the site’s own language', () => {
  tracker({ banner: { text: 'Ein Cookie, nur zum Zählen.', accept: 'Einverstanden', decline: 'Nein danke', policy: '/datenschutz' } })
  expect(bar()!.querySelector('p')!.textContent).toContain('Ein Cookie, nur zum Zählen.')
  expect(button(0).textContent).toBe('Nein danke')
  expect(button(1).textContent).toBe('Einverstanden')
  expect(bar()!.querySelector('a')!.getAttribute('href')).toBe('/datenschutz')
})

it('keeps the site’s stylesheet out, by living in a shadow root', () => {
  tracker()
  const host = win.document.body.lastElementChild as any
  expect(host.shadowRoot).toBeTruthy()
  expect(host.shadowRoot.querySelector('style')).toBeTruthy()
})
