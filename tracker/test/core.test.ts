import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { start, type Config } from '../src/core'

type Sent = Record<string, any>

let win: Window
let sent: Sent[]
let status: number
let fetchFails: boolean

// A fresh browser per test: start() adds listeners and patches history, so
// sharing one window would leak state between tests.
function browser(url = 'https://site.com/pricing?utm_source=hn', referrer = 'https://news.ycombinator.com/') {
  win = new Window({ url, width: 1440, height: 900 })
  Object.defineProperty(win.document, 'referrer', { value: referrer, configurable: true })
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
    navigator: { language: 'de-DE', webdriver: false },
    fetch: vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body))
      if (fetchFails) throw new TypeError('network down')
      return { status }
    }),
  }
  for (const [k, v] of Object.entries(defs)) Object.defineProperty(g, k, { value: v, configurable: true, writable: true })
}

const tracker = (c: Partial<Config> = {}) => start({ site: 'tkb_test', api: 'https://stats.site.com/api/e', ...c })
const flush = () => new Promise((r) => setTimeout(r, 0))
const byKind = (k: string) => sent.filter((e) => e.k === k)
const queued = () => JSON.parse(win.localStorage.getItem('trckable_q') || '[]')

beforeEach(() => {
  sent = []
  status = 202
  fetchFails = false
  browser()
})
afterEach(() => vi.restoreAllMocks())

describe('pageviews', () => {
  it('sends the first view with raw signals only', async () => {
    tracker()
    await flush()
    const [pv] = byKind('pv')
    expect(pv).toMatchObject({
      s: 'tkb_test',
      k: 'pv',
      u: 'https://site.com/pricing?utm_source=hn',
      r: 'https://news.ycombinator.com/',
      w: win.screen.width,
      l: 'de-DE',
    })
    expect(pv.id).toMatch(/^[0-9a-z]+$/)
    expect(pv.pv).toMatch(/^[0-9a-z]+$/)
    expect(pv.v).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/) // "<id>.<first-seen>"
  })

  it('counts SPA navigations once and ignores same-URL replaceState', async () => {
    tracker()
    win.history.pushState({}, '', '/docs')
    win.history.replaceState({}, '', '/docs') // frameworks do this constantly
    win.history.pushState({}, '', '/docs#intro') // hash only: not a new page
    win.history.pushState({}, '', '/blog')
    await flush()
    expect(byKind('pv').map((e) => new URL(e.u).pathname)).toEqual(['/pricing', '/docs', '/blog'])
    expect(byKind('pv').slice(1).every((e) => e.r === '')).toBe(true) // internal, no referrer
    expect(new Set(byKind('pv').map((e) => e.pv)).size).toBe(3)
  })

  it('counts #/routes in hash mode', async () => {
    browser('https://site.com/app#/home', '')
    tracker({ hash: true })
    win.location.hash = '#/settings'
    win.dispatchEvent(new win.Event('hashchange'))
    await flush()
    expect(byKind('pv').map((e) => new URL(e.u).hash)).toEqual(['#/home', '#/settings'])
  })

  it('counts a back/forward cache restore as a view', async () => {
    tracker()
    const e = new win.Event('pageshow') as any
    Object.defineProperty(e, 'persisted', { value: true })
    win.dispatchEvent(e)
    await flush()
    expect(byKind('pv')).toHaveLength(2)
  })
})

describe('goals', () => {
  it('tracks goals from the API with properties', async () => {
    const t = tracker()
    t('goal', 'signup', { plan: 'pro' })
    await flush()
    expect(byKind('g')[0]).toMatchObject({ k: 'g', n: 'signup', p: { plan: 'pro' } })
  })

  it('tracks data-trckable-goal clicks, with kebab-case props as snake_case', async () => {
    win.document.body.innerHTML =
      '<button data-trckable-goal="checkout_started" data-trckable-goal-plan="pro" data-trckable-goal-trial-days="14"><span id="x">Buy</span></button>'
    tracker()
    ;(win.document.getElementById('x') as any).click()
    await flush()
    expect(byKind('g')[0]).toMatchObject({ n: 'checkout_started', p: { plan: 'pro', trial_days: '14' } })
  })

  it('counts a form submission as a goal, and leaves search and ignored forms alone', async () => {
    win.document.body.innerHTML = `
      <form id="signup" action="/join"><input name="email"></form>
      <form data-trckable-form="newsletter"><input name="email"></form>
      <form role="search"><input name="q"></form>
      <form data-trckable-ignore><input name="x"></form>`
    tracker()
    const submit = (sel: string) => win.document.querySelector(sel)!.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }) as any)
    submit('#signup')
    submit('[data-trckable-form]')
    submit('[role=search]')
    submit('[data-trckable-ignore]')
    await flush()
    const goals = byKind('g')
    expect(goals).toHaveLength(2)
    expect(goals[0]).toMatchObject({ n: 'form_submit', p: { form: 'signup' } })
    expect(goals[1]).toMatchObject({ n: 'newsletter', p: { form: '/pricing' } })
  })

  it('tracks outbound links and downloads automatically', async () => {
    win.document.body.innerHTML =
      '<a id="out" href="https://github.com/trckable/trckable">gh</a><a id="dl" href="/files/guide.pdf">pdf</a><a id="in" href="/about">about</a>'
    tracker()
    for (const id of ['out', 'dl', 'in']) {
      const a = win.document.getElementById(id) as any
      a.addEventListener('click', (e: Event) => e.preventDefault())
      a.click()
    }
    await flush()
    expect(byKind('g').map((e) => [e.n, e.p.url])).toEqual([
      ['outbound_click', 'github.com/trckable/trckable'],
      ['file_download', '/files/guide.pdf'],
    ])
  })
})

describe('revenue attribution', () => {
  it('adds the visitor id to hosted checkout links, keeping existing references', async () => {
    win.document.cookie = 'trckable_vid=abc123.m1a2b3'
    const links = {
      stripe: 'https://buy.stripe.com/test_eVa3cd',
      stripeOwn: 'https://buy.stripe.com/x?client_reference_id=order_9',
      lemon: 'https://acme.lemonsqueezy.com/buy/2f1?embed=1',
      polar: 'https://buy.polar.sh/polar_cl_Xy',
      dodo: 'https://checkout.dodopayments.com/buy/pdt_1?quantity=1',
      docs: 'https://docs.stripe.com/payments',
    }
    win.document.body.innerHTML = Object.entries(links).map(([id, h]) => `<a id="${id}" href="${h}">x</a>`).join('')
    tracker()
    const href: Record<string, string> = {}
    for (const id of Object.keys(links)) {
      const a = win.document.getElementById(id) as any
      a.addEventListener('click', (e: Event) => e.preventDefault())
      a.click()
      href[id] = new URL(a.href).search
    }
    const q = (s: string) => Object.fromEntries(new URLSearchParams(s))
    expect(q(href.stripe)).toEqual({ client_reference_id: 'trckable_abc123_m1a2b3' })
    expect(q(href.stripeOwn)).toEqual({ client_reference_id: 'order_9' }) // never overwrite yours
    expect(q(href.lemon)).toEqual({ embed: '1', 'checkout[custom][trckable_vid]': 'trckable_abc123_m1a2b3' })
    expect(q(href.polar)).toEqual({ reference_id: 'trckable_abc123_m1a2b3' })
    expect(q(href.dodo)).toEqual({ quantity: '1', metadata_trckable_vid: 'trckable_abc123_m1a2b3' })
    expect(href.docs).toBe('') // only checkout hosts
  })

  it('leaves checkout links alone in cookieless mode (no visitor id to share)', async () => {
    win.document.body.innerHTML = '<a id="s" href="https://buy.stripe.com/abc">buy</a>'
    tracker({ cookieless: true })
    const a = win.document.getElementById('s') as any
    a.addEventListener('click', (e: Event) => e.preventDefault())
    a.click()
    expect(a.href).toBe('https://buy.stripe.com/abc')
  })
})

describe('engagement', () => {
  it('sends visible time and scroll depth when the page is hidden', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    tracker()
    ;(Date.now as any).mockReturnValue(1_012_500)
    Object.defineProperty(win.document, 'visibilityState', { value: 'hidden', configurable: true })
    win.document.dispatchEvent(new win.Event('visibilitychange'))
    await flush()
    const [e] = byKind('e')
    expect(e.en).toBe(12_500)
    expect(e.pv).toBe(byKind('pv')[0].pv)
  })
})

describe('delivery (write-ahead queue)', () => {
  it('removes an event from the queue once acknowledged', async () => {
    tracker()
    await flush()
    await flush()
    expect(queued()).toHaveLength(0)
  })

  it('keeps events when the network fails and retries them on the next page with their age', async () => {
    fetchFails = true
    vi.spyOn(Date, 'now').mockReturnValue(5_000_000)
    tracker()
    await flush()
    expect(queued()).toHaveLength(1)
    const lost = queued()[0][0]

    // Next page load, 10 s later, network is back.
    fetchFails = false
    ;(Date.now as any).mockReturnValue(5_010_000)
    const storage = win.localStorage.getItem('trckable_q')!
    browser('https://site.com/next', 'https://site.com/pricing')
    win.localStorage.setItem('trckable_q', storage)
    sent = []
    tracker()
    await flush()
    await flush()
    const retry = sent.find((e) => e.id === lost.id)!
    expect(retry.a).toBe(10_000) // server back-dates the event
    expect(queued()).toHaveLength(0)
  })

  it('retries on 5xx but drops on 4xx', async () => {
    status = 503
    tracker()
    await flush()
    await flush()
    expect(queued()).toHaveLength(1)
    const storage = win.localStorage.getItem('trckable_q')!
    status = 400 // e.g. the site was deleted: retrying forever would be pointless
    browser()
    win.localStorage.setItem('trckable_q', storage)
    sent = []
    tracker()
    await flush()
    await flush()
    expect(sent.filter((e) => e.id === JSON.parse(storage)[0][0].id)).toHaveLength(1) // it was retried…
    expect(queued()).toHaveLength(0) // …and dropped after the 4xx
  })

  it('drops queued events older than 30 minutes', async () => {
    win.localStorage.setItem('trckable_q', JSON.stringify([[{ id: 'old', k: 'pv' }, Date.now() - 31 * 60_000]]))
    tracker()
    await flush()
    expect(sent.find((e) => e.id === 'old')).toBeUndefined()
  })
})

describe('privacy and modes', () => {
  it('cookieless mode stores nothing in the browser', async () => {
    tracker({ cookieless: true })
    await flush()
    expect(win.document.cookie).toBe('')
    expect(win.localStorage.length).toBe(0)
    expect(byKind('pv')[0].v).toBeUndefined()
  })

  it('cookieless mode does not even read browser storage', async () => {
    let touched = 0
    Object.defineProperty(globalThis, 'localStorage', { get: () => (touched++, win.localStorage), configurable: true })
    tracker({ cookieless: true })
    await flush()
    expect(touched).toBe(0)
  })

  it('consent upgrades cookieless to cookie mode', async () => {
    const t = tracker({ cookieless: true })
    t('consent', true)
    t('goal', 'signup')
    await flush()
    expect(byKind('g')[0].v).toMatch(/\./)
  })

  it('does not write the cookie itself behind a same-origin proxy (the server sets it)', async () => {
    tracker({ api: '/api/e' })
    await flush()
    expect(win.document.cookie).not.toContain('trckable_vid')
  })

  it('reuses an existing visitor cookie', async () => {
    win.document.cookie = 'trckable_vid=abc123.m1a2b3'
    tracker()
    await flush()
    expect(byKind('pv')[0].v).toBe('abc123.m1a2b3')
  })

  it.each([
    ['opted out via trckable_ignore', () => win.localStorage.setItem('trckable_ignore', '1'), {}],
    ['on localhost', () => browser('http://localhost:3000/', ''), {}],
    ['under automation', () => ((globalThis as any).navigator.webdriver = true), {}],
    ['without a site id', () => {}, { site: '' }],
  ])('sends nothing when %s', async (_name, setup, cfg) => {
    setup()
    tracker(cfg)
    await flush()
    expect(sent).toHaveLength(0)
  })

  it('dev mode also tracks automated browsers (for your own e2e tests)', async () => {
    browser('http://localhost:3000/', '')
    ;(globalThis as any).navigator.webdriver = true
    tracker({ dev: true })
    await flush()
    expect(byKind('pv')).toHaveLength(1)
  })

  it('allows localhost with dev and marks the events', async () => {
    browser('http://localhost:3000/', '')
    tracker({ dev: true })
    await flush()
    expect(byKind('pv')[0].dev).toBe(1)
  })
})
