import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { start, type Config } from '../src/core'

type Sent = Record<string, any>

let win: Window
let sent: Sent[]
let status: number
let fetchFails: boolean
let gate: Promise<void> | null // while set, answers wait for it
let inflight: number
let peak: number // the most requests that were out at the same time

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
      peak = Math.max(peak, ++inflight)
      try {
        if (gate) await gate
        if (fetchFails) throw new TypeError('network down')
        return { status }
      } finally {
        inflight--
      }
    }),
  }
  for (const [k, v] of Object.entries(defs)) Object.defineProperty(g, k, { value: v, configurable: true, writable: true })
}

const tracker = (c: Partial<Config> = {}) => start({ site: 'tkb_test', api: 'https://stats.site.com/api/e', ...c })
const flush = () => new Promise((r) => setTimeout(r, 0))
const byKind = (k: string) => sent.filter((e) => e.k === k)
const queued = () => JSON.parse(win.localStorage.getItem('trckable_q') || '[]')
const online = () => win.dispatchEvent(new win.Event('online'))
const hidden = (h: boolean) => {
  Object.defineProperty(win.document, 'hidden', { value: h, configurable: true })
  win.document.dispatchEvent(new win.Event('visibilitychange'))
}

beforeEach(() => {
  sent = []
  status = 202
  fetchFails = false
  gate = null
  inflight = peak = 0
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

  it('does not count a query that changes on the same path (search boxes, filters)', async () => {
    tracker()
    win.history.replaceState({}, '', '/pricing?q=a')
    win.history.replaceState({}, '', '/pricing?q=ab')
    win.history.pushState({}, '', '/pricing?page=2')
    await flush()
    expect(byKind('pv')).toHaveLength(1)
    win.history.pushState({}, '', '/docs?q=ab')
    await flush()
    expect(byKind('pv').map((e) => new URL(e.u).pathname)).toEqual(['/pricing', '/docs'])
  })

  it('counts a changed #/route in hash mode, query inside the route included', async () => {
    browser('https://site.com/app#/list?page=1', '')
    tracker({ hash: true })
    win.history.replaceState({}, '', '/app#/list?page=2')
    win.history.replaceState({}, '', '/app#/list?page=2')
    await flush()
    expect(byKind('pv').map((e) => new URL(e.u).hash)).toEqual(['#/list?page=1', '#/list?page=2'])
  })

  it('runs once per page however many times it is loaded (tag and bundle)', async () => {
    const first = tracker()
    const second = tracker()
    expect(second).toBe(first)
    win.history.pushState({}, '', '/docs')
    await flush()
    expect(byKind('pv')).toHaveLength(2) // not one per copy
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
    // A browser changes both together; the tracker reads document.hidden.
    Object.defineProperty(win.document, 'visibilityState', { value: 'hidden', configurable: true })
    Object.defineProperty(win.document, 'hidden', { value: true, configurable: true })
    win.document.dispatchEvent(new win.Event('visibilitychange'))
    await flush()
    const [e] = byKind('e')
    expect(e.en).toBe(12_500)
    expect(e.pv).toBe(byKind('pv')[0].pv)
  })
})

describe('scroll depth', () => {
  const scrolled = async (y: number, height: number) => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    tracker()
    Object.defineProperty(win.document.documentElement, 'scrollHeight', { value: height, configurable: true })
    ;(globalThis as any).scrollY = y
    win.dispatchEvent(new win.Event('scroll'))
    ;(Date.now as any).mockReturnValue(1_005_000)
    Object.defineProperty(win.document, 'hidden', { value: true, configurable: true })
    win.document.dispatchEvent(new win.Event('visibilitychange'))
    await flush()
    return byKind('e')[0].sc
  }
  it('is 0 at the top of a scrollable page', async () => {
    expect(await scrolled(0, 3000)).toBe(0)
  })
  it('is the share scrolled partway down', async () => {
    expect(await scrolled(1050, 3000)).toBe(50)
  })
  it('is 100 on a page that does not scroll', async () => {
    expect(await scrolled(0, 900)).toBe(100)
  })
})

describe('delivery (write-ahead queue)', () => {
  afterEach(() => vi.useRealTimers())
  const HOUR = 3_600_000

  // A later page load in the same browser: a new window that has the same storage.
  const nextPage = (url = 'https://site.com/next', referrer = 'https://site.com/pricing') => {
    const storage = win.localStorage.getItem('trckable_q')
    browser(url, referrer)
    if (storage) win.localStorage.setItem('trckable_q', storage)
    sent = []
  }
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
    const lost = queued()[0]

    // Next page load, 10 s later, network is back.
    fetchFails = false
    ;(Date.now as any).mockReturnValue(5_010_000)
    nextPage()
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
    const id = queued()[0].id
    status = 400 // e.g. the site was deleted: retrying forever would be pointless
    nextPage()
    tracker()
    await flush()
    await flush()
    expect(sent.filter((e) => e.id === id)).toHaveLength(1) // it was retried…
    expect(queued()).toHaveLength(0) // …and dropped after the 4xx
  })

  it('keeps an event a day, and sends it with the age it has: the day it happened on', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    fetchFails = true
    tracker()
    await vi.advanceTimersByTimeAsync(0)
    const id = queued()[0].id
    expect(queued()[0].id).toBe(id)

    // The visitor comes back 20 hours later; the server is up.
    vi.setSystemTime(Date.now() + 20 * HOUR)
    fetchFails = false
    nextPage()
    tracker()
    await vi.advanceTimersByTimeAsync(0)
    const retry = sent.find((e) => e.id === id)!
    expect(retry.a).toBe(20 * HOUR)
    expect(queued()).toHaveLength(0)
  })

  it('drops what is older than 24 hours, and keeps what is a little younger', async () => {
    const t = Date.now()
    const old = (id: string, age: number) => ({ id, k: 'pv', s: 'tkb_test', u: 'https://site.com/old', a: t - age })
    win.localStorage.setItem('trckable_q', JSON.stringify([old('stale', 24 * HOUR + 1000), old('fresh', 24 * HOUR - 60_000)]))
    tracker()
    await flush()
    expect(sent.find((e) => e.id === 'stale')).toBeUndefined()
    expect(sent.find((e) => e.id === 'fresh')!.a).toBeGreaterThan(24 * HOUR - 61_000)
    expect(queued().some((e: any) => e.id === 'stale')).toBe(false)
  })

  it('ignores a queue written by an earlier version of the script, and does not send it', async () => {
    win.localStorage.setItem('trckable_q', JSON.stringify([[{ id: 'older', k: 'pv' }, Date.now() - 60_000]]))
    tracker()
    await flush()
    expect(sent.find((e) => e.id === 'older')).toBeUndefined()
    expect(sent.every((e) => typeof e.s == 'string')).toBe(true)
  })

  it('keeps the newest 200, the oldest dropped first', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    fetchFails = true
    tracker()
    for (let i = 0; i < 250; i++) (win as any).__trk('goal', 'g' + i)
    await vi.advanceTimersByTimeAsync(0)
    const q = queued()
    expect(q).toHaveLength(200)
    expect(q[q.length - 1].n).toBe('g249')
    expect(q[0].n).toBe('g50') // the pageview and the first 49 goals are the oldest
  })

  it('sends a backlog oldest first, one request at a time, before the page that found it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    const t = Date.now()
    const ev = (n: number) => ({ id: 'q' + n, k: 'g', n: 'goal' + n, s: 'tkb_test', u: 'https://site.com/old', v: 'abc.def', a: t - (5 - n) * HOUR })
    win.localStorage.setItem('trckable_q', JSON.stringify([ev(1), ev(2), ev(3)]))
    gate = new Promise((r) => setTimeout(r, 100)) // every answer takes 100 ms
    tracker()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent.map((e) => e.id).slice(0, 3)).toEqual(['q1', 'q2', 'q3'])
    expect(sent[3].k).toBe('pv') // this page's own view comes after them
    expect(peak).toBe(1) // one at a time
    expect(sent[0].a).toBe(4 * HOUR)
    expect(queued()).toHaveLength(0)
  })

  it('backs off while the server is down: 2 s, 4 s, 8 s, then no more than about 4 minutes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    status = 503
    tracker()
    await vi.advanceTimersByTimeAsync(0)
    const at: number[] = []
    let n = sent.length
    const start = Date.now()
    for (let ms = 0; ms < 3_600_000; ms += 500) {
      await vi.advanceTimersByTimeAsync(500)
      if (sent.length > n) {
        at.push(Date.now() - start)
        n = sent.length
      }
    }
    expect(at.slice(0, 4)).toEqual([2000, 6000, 14_000, 30_000]) // each wait twice the one before
    const gaps = at.slice(1).map((x, i) => x - at[i])
    expect(Math.max(...gaps)).toBeLessThanOrEqual(260_000)
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(250_000) // and it settles there
    expect(new Set(sent.map((e) => e.id)).size).toBe(1) // always the same event, never a copy with a new id
    expect(peak).toBe(1)
  })

  it('tries again at once when the browser is online again, or the tab is shown', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    status = 503
    tracker()
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toHaveLength(1)
    status = 202
    online()
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toHaveLength(2) // no waiting for the next pause
    expect(queued()).toHaveLength(0)

    status = 503
    ;(win as any).__trk('goal', 'again')
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toHaveLength(3)
    status = 202
    hidden(true)
    hidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(sent.filter((e) => e.n == 'again')).toHaveLength(2)
    expect(queued()).toHaveLength(0)
  })

  it('never has two requests of the retry loop out at once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    status = 503
    tracker()
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 5; i++) (win as any).__trk('goal', 'w' + i) // wait their turn
    status = 202
    let release!: () => void
    gate = new Promise<void>((r) => (release = r)) // the next answer hangs
    online()
    online()
    hidden(false)
    await vi.advanceTimersByTimeAsync(10)
    expect(inflight).toBe(1)
    release()
    gate = null
    await vi.advanceTimersByTimeAsync(10)
    expect(peak).toBe(1)
    expect(queued()).toHaveLength(0)
    expect(sent.filter((e) => e.k == 'g').map((e) => e.n)).toEqual(expect.arrayContaining(['w0', 'w1', 'w2', 'w3', 'w4']))
  })

  it('while the server answers, each event goes out at once and on its own', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    let release!: () => void
    gate = new Promise<void>((r) => (release = r))
    tracker()
    ;(win as any).__trk('goal', 'quick')
    await vi.advanceTimersByTimeAsync(0)
    expect(sent.map((e) => e.k)).toEqual(['pv', 'g']) // the goal does not wait for the page view's answer
    release()
    await vi.advanceTimersByTimeAsync(0)
  })

  it('does not send an event again and again when the browser will not let it be removed from the queue', async () => {
    const left = { id: 'left', k: 'pv', s: 'tkb_test', u: 'https://site.com/earlier', v: 'abc.def', a: Date.now() - 60_000 }
    win.localStorage.setItem('trckable_q', JSON.stringify([left]))
    const real = win.localStorage
    // Full: it can be read, and nothing more can be written.
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => real.getItem(k),
        removeItem: (k: string) => real.removeItem(k),
        setItem: () => {
          throw new DOMException('full', 'QuotaExceededError')
        },
      },
      configurable: true,
      writable: true,
    })
    tracker()
    await flush()
    await flush()
    await flush()
    expect(sent.filter((e) => e.id === 'left')).toHaveLength(1)
    expect(sent).toHaveLength(2) // the one left behind, and this page's own
  })

  it('stops sending, and forgets what is queued, when the visitor says no', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    status = 503
    const t = tracker()
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toHaveLength(1)
    t('consent', false)
    status = 202
    online()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sent).toHaveLength(1)
  })
})

describe('delivery without storage', () => {
  afterEach(() => vi.useRealTimers())

  it('retries a cookieless event from memory with the same id, and never touches storage', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    status = 503 // a deploy in progress
    tracker({ cookieless: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toHaveLength(1)
    status = 202
    await vi.advanceTimersByTimeAsync(2000)
    expect(sent).toHaveLength(2)
    expect(sent[1].id).toBe(sent[0].id)
    expect(sent[1].a).toBeGreaterThanOrEqual(2000) // the server dates it when it happened
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent).toHaveLength(2) // acknowledged: no more
    expect(win.localStorage.length).toBe(0)
  })

  it('keeps trying, with longer and longer pauses, for as long as the page is open', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    fetchFails = true
    tracker({ cookieless: true })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent.length).toBeGreaterThan(3)
    await vi.advanceTimersByTimeAsync(2 * 3_600_000)
    expect(sent.length).toBeLessThan(40) // 4-minute pauses, not a flood
    expect(new Set(sent.map((e) => e.id)).size).toBe(1)
    fetchFails = false
    online()
    await vi.advanceTimersByTimeAsync(10)
    expect(sent[sent.length - 1].a).toBeGreaterThan(2 * 3_600_000) // and the server is told how long it waited
    expect(win.localStorage.length).toBe(0) // nothing was kept, not even a failed attempt
  })

  it('does not retry a rejected event (4xx)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    status = 400
    tracker({ cookieless: true })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent).toHaveLength(1)
  })

  it('loses what was not delivered when the page closes: a new page starts with nothing', async () => {
    fetchFails = true
    tracker({ cookieless: true })
    await flush()
    expect(win.localStorage.length).toBe(0)
    browser()
    fetchFails = false
    sent = []
    tracker({ cookieless: true })
    await flush()
    expect(sent).toHaveLength(1) // only this page's view
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

  it('gives a same-origin proxy the id from the first event on, so an instant click is the same visitor', async () => {
    const t = tracker({ api: '/api/e' })
    t('goal', 'checkout_click') // leaves before the first answer could set a cookie
    await flush()
    const ids = sent.map((e) => e.v)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/)
    expect(ids[1]).toBe(ids[0])
    expect(win.document.cookie).toContain('trckable_vid=' + ids[0]) // the server sets the same value again
  })

  it('counts a browser that refuses cookies without an id, not as a new visitor per event', async () => {
    Object.defineProperty(win.document, 'cookie', { get: () => '', set: () => {}, configurable: true })
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000) // no time passes, so no time on the first page to report
    const t = tracker()
    t('goal', 'signup')
    win.history.pushState({}, '', '/docs')
    await flush()
    expect(sent).toHaveLength(3)
    expect(sent.every((e) => e.c === 1 && e.v === undefined)).toBe(true)
    expect(queued()).toEqual([]) // nothing is kept for them in storage either
  })

  it('leaves this browser out with ?trckable=ignore, and back in with ?trckable=track', async () => {
    browser('https://site.com/?trckable=ignore', '')
    tracker()
    await flush()
    expect(sent).toHaveLength(0)
    expect(win.localStorage.getItem('trckable_ignore')).toBe('1')

    browser('https://site.com/pricing', '') // another page: the flag is still there
    win.localStorage.setItem('trckable_ignore', '1')
    tracker()
    await flush()
    expect(sent).toHaveLength(0)

    browser('https://site.com/?utm_source=x&trckable=track', '')
    win.localStorage.setItem('trckable_ignore', '1')
    tracker()
    await flush()
    expect(win.localStorage.getItem('trckable_ignore')).toBe(null)
    expect(byKind('pv')).toHaveLength(1)
  })

  it('keeps no exclusion flag in consent-free mode, which stores nothing', async () => {
    browser('https://site.com/?trckable=ignore', '')
    tracker({ cookieless: true })
    await flush()
    expect(win.localStorage.length).toBe(0)
    expect(byKind('pv')).toHaveLength(1)
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
