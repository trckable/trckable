import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { heat, type Heat } from '../src/heatmap'

type Batch = { s: string; u: string; w: number; h: number; dev: number; i: any[][] }

let win: Window
let sent: Batch[]

const html = `
<main id="page">
  <button class="buy">Buy</button>
  <div class="card" style="cursor:pointer">Clickable</div>
  <p class="plain">Words</p>
  <ul><li>one</li><li>two</li></ul>
  <form id="signup"><input name="email"><input name="plan"><input type="password" name="secret"><button type="submit">Go</button></form>
</main>`

function browser(over: { dnt?: boolean; tracker?: boolean } = {}) {
  win = new Window({ url: 'https://site.com/pricing?x=1', width: 1440, height: 900 })
  win.document.body.innerHTML = html
  const g = globalThis as any
  const defs: Record<string, unknown> = {
    window: win,
    document: win.document,
    location: win.location,
    navigator: { doNotTrack: over.dnt ? '1' : null },
    innerWidth: 1440,
    scrollX: 0,
    scrollY: 0,
    getComputedStyle: (e: any) => win.getComputedStyle(e),
    MutationObserver: win.MutationObserver,
    fetch: vi.fn(async (_u: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body))
      return { status: 202 }
    }),
  }
  for (const [k, v] of Object.entries(defs)) Object.defineProperty(g, k, { value: v, configurable: true, writable: true })
  if (over.tracker !== false) (win as any).__trk = () => {}
}

const start = (c: Partial<Heat> = {}) => heat({ site: 'tkb_test', api: 'https://stats.site.com/api/h', ...c })
const q = (s: string) => win.document.querySelector(s) as unknown as HTMLElement
const click = (s: string) => q(s).dispatchEvent(new win.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }) as any)
const items = () => sent.flatMap((b) => b.i)
const hide = () => {
  Object.defineProperty(win.document, 'hidden', { value: true, configurable: true })
  win.document.dispatchEvent(new win.Event('visibilitychange'))
}

beforeEach(() => {
  sent = []
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('heatmaps', () => {
  it('reports a click as the element and where in it, and counts the page once', () => {
    browser()
    ;(q('.buy') as any).getBoundingClientRect = () => ({ left: 100, top: 50, width: 100, height: 40 })
    start()
    q('.buy').dispatchEvent(new win.MouseEvent('click', { bubbles: true, clientX: 125, clientY: 70 }) as any)
    hide()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ s: 'tkb_test', u: 'https://site.com/pricing?x=1', w: 1440 })
    expect(sent[0].i[0]).toEqual(['v'])
    const c = sent[0].i[1]
    // the element, the tenth of its width and of its height the click landed in,
    // then where the element is: thousandths of the window across, pixels down
    expect(c).toEqual(['c', 'main#page>button.buy', 2, 5, 69, 50, 69, 40])
  })

  it('names an element by tag, id and class, and tells same-named siblings apart', () => {
    browser()
    start()
    click('li:last-child')
    click('#page')
    hide()
    const sel = items().filter((i) => i[0] == 'c').map((i) => i[1])
    expect(sel).toEqual(['main#page>ul>li:2', 'main#page'])
  })

  it('leaves generated class names out of the selector', () => {
    browser()
    q('.plain').className = 'css-1x2y3z Button_primary__x7Hq'
    start()
    click('p')
    hide()
    expect(items().find((i) => i[0] == 'c')![1]).toBe('main#page>p')
  })

  it('counts three clicks on one element within a second as a rage click, once', () => {
    browser()
    start()
    click('.plain')
    click('.plain')
    click('.plain')
    click('.plain')
    hide()
    expect(items().filter((i) => i[0] == 'r')).toHaveLength(1)
    expect(items().filter((i) => i[0] == 'c')).toHaveLength(4)
  })

  it('does not call three clicks on different elements, or slow ones, a rage click', () => {
    browser()
    start()
    click('.plain')
    click('.buy')
    click('.plain')
    vi.advanceTimersByTime(1500)
    click('.plain')
    click('.plain')
    hide()
    expect(items().filter((i) => i[0] == 'r')).toHaveLength(0)
  })

  it('reports a click that looks clickable and changes nothing as dead', () => {
    browser()
    start()
    click('.card')
    vi.advanceTimersByTime(700)
    hide()
    expect(items().filter((i) => i[0] == 'd').map((i) => i[1])).toEqual(['main#page>div.card'])
  })

  it('does not report a click as dead when the page changed, or on a plain paragraph', async () => {
    browser()
    start()
    click('.buy')
    q('main').append(win.document.createElement('span') as any)
    await vi.advanceTimersByTimeAsync(700)
    click('.plain')
    await vi.advanceTimersByTimeAsync(700)
    hide()
    expect(items().filter((i) => i[0] == 'd')).toHaveLength(0)
  })

  it('reports the field a form was left at, by name, and the fields reached', () => {
    browser()
    start()
    q('[name=email]').dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }) as any)
    q('[name=plan]').dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }) as any)
    win.dispatchEvent(new win.Event('pagehide'))
    expect(items().filter((i) => i[0] == 'fr').map((i) => i[1])).toEqual(['signup>email', 'signup>plan'])
    expect(items().filter((i) => i[0] == 'fd').map((i) => i[1])).toEqual(['signup>plan'])
  })

  it('does not call a sent form left, and never names a password field', () => {
    browser()
    start()
    q('[name=email]').dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }) as any)
    q('[name=secret]').dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }) as any)
    q('#signup').dispatchEvent(new win.Event('submit', { bubbles: true }) as any)
    win.dispatchEvent(new win.Event('pagehide'))
    expect(items().filter((i) => i[0] == 'fd')).toHaveLength(0)
    expect(JSON.stringify(sent)).not.toContain('secret')
  })

  it('never sends what was typed', () => {
    browser()
    start()
    const email = q('[name=email]') as unknown as HTMLInputElement
    const secret = q('[name=secret]') as unknown as HTMLInputElement
    email.dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }) as any)
    email.value = 'ada@lovelace.example'
    email.dispatchEvent(new win.Event('input', { bubbles: true }) as any)
    secret.value = 'hunter2hunter2'
    click('[name=email]')
    win.dispatchEvent(new win.Event('pagehide'))
    const body = JSON.stringify(sent)
    expect(body).not.toContain('lovelace')
    expect(body).not.toContain('ada@')
    expect(body).not.toContain('hunter2')
    expect(body).toContain('signup>email')
  })

  it('stops after 60 items a page view', () => {
    browser()
    start()
    for (let i = 0; i < 100; i++) {
      click('.buy')
      vi.advanceTimersByTime(1100)
    }
    hide()
    expect(items().filter((i) => i[0] == 'c').length).toBeLessThanOrEqual(60)
  })

  it('sends a batch once 20 are waiting, without waiting for the page to be hidden', () => {
    browser()
    start()
    for (let i = 0; i < 25; i++) {
      click('.plain')
      vi.advanceTimersByTime(1100)
    }
    expect(sent.length).toBeGreaterThanOrEqual(1)
  })

  it('samples whole page views, so a sampled-out page sends nothing', () => {
    browser()
    start({ sample: 0 })
    click('.buy')
    vi.advanceTimersByTime(1000)
    hide()
    expect(sent).toHaveLength(0)
  })

  it('does nothing when the base script is not counting this visit', () => {
    browser({ tracker: false })
    start()
    click('.buy')
    hide()
    expect(sent).toHaveLength(0)
  })

  it('does nothing for a browser that says do not track', () => {
    browser({ dnt: true })
    start()
    click('.buy')
    hide()
    expect(sent).toHaveLength(0)
  })

  it('does nothing when the events address is not one it can derive the heat address from', () => {
    browser()
    start({ api: 'https://stats.site.com/collect' })
    click('.buy')
    hide()
    expect(sent).toHaveLength(0)
  })

  it('touches no storage and sets no cookie', () => {
    browser()
    start()
    click('.buy')
    hide()
    expect(win.document.cookie).toBe('')
    expect(win.localStorage.length).toBe(0)
  })
})
