// Fixture mode (a development build only): `?fixture=hn` answers the whole API from one of the mock's scenarios, with the
// clock at the scenario's "now", so the page can be set beside the mock number for number. `&conn=` says what is
// connected: none (the default), rev, search or both. The choice is kept for the tab, so a reload or a link inside the
// app stays on it. main.tsx loads this behind `import.meta.env.DEV`, so a production build carries none of it.
import { SCN, END, SITES } from './data'
import { buildWorld } from './engine'
import { answer } from './routes'
import { online, siteOf, type Conn, type Ctx } from './report'

const KEY = 'trckable:fixture'

export const CONNS = ['none', 'rev', 'search', 'both'] as const
export type ConnName = (typeof CONNS)[number]

function connOf(name: ConnName): Conn {
  return { rev: name === 'rev' || name === 'both', search: name === 'search' || name === 'both', goals: true, uptime: true, alerts: true }
}

function chosen(): { name: string; conn: ConnName } | null {
  const sp = new URLSearchParams(location.search)
  const fromUrl = sp.get('fixture')
  let raw = fromUrl
  if (!raw) {
    try {
      raw = sessionStorage.getItem(KEY)
    } catch {
      raw = null
    }
  }
  if (!raw) return null
  const [name, suffix] = raw.split(':')
  const asked = sp.get('conn') ?? suffix ?? 'none'
  const conn = (CONNS as readonly string[]).includes(asked) ? (asked as ConnName) : 'none'
  if (!(name in SCN)) {
    console.warn(`fixture: no scenario "${name}"; there are ${Object.keys(SCN).join(', ')}`)
    return null
  }
  try {
    sessionStorage.setItem(KEY, `${name}:${conn}`)
  } catch {
    /* only the reload forgets it */
  }
  return { name, conn }
}

/** The page's clock stands at one moment, as the mock's does. */
function freezeClock(ms: number) {
  const Real = Date
  class FixtureDate extends Real {
    constructor(...a: number[]) {
      super(...((a.length === 0 ? [ms] : a) as [number]))
    }
    static override now() {
      return ms
    }
  }
  globalThis.Date = FixtureDate as unknown as DateConstructor
}

export function installFixture() {
  const pick = chosen()
  if (!pick) return
  const w = buildWorld(pick.name)
  const ctx: Ctx = { w, nowAbs: END * 1440 + w.sc.now, conn: connOf(pick.conn) }
  freezeClock(w.start + ctx.nowAbs * 60000)
  const real = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.origin)
    if (!url.pathname.startsWith('/api/v1/')) return real(input, init)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const r = answer(ctx, method, url.pathname.slice('/api/v1'.length), url.searchParams)
    if (!r) {
      console.warn(`fixture: no answer for ${method} ${url.pathname}`)
      return Promise.resolve(new Response(JSON.stringify({ error: 'not in the fixture' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
    }
    return Promise.resolve(new Response(r.status === 204 ? null : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } }))
  }
  window.EventSource = class FixtureStream extends EventTarget {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 2
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSED = 2
    readyState = 1
    url: string
    withCredentials = false
    onerror: ((e: Event) => void) | null = null
    onmessage: ((e: MessageEvent) => void) | null = null
    onopen: ((e: Event) => void) | null = null
    constructor(url: string) {
      super()
      this.url = url
      const site = SITES.find((s) => url.includes(`/sites/${s.id}/`))
      setTimeout(() => {
        this.dispatchEvent(new MessageEvent('ping', { data: '' }))
        if (site) this.dispatchEvent(new MessageEvent('online', { data: JSON.stringify({ online: online(ctx, siteOf(site.id)) }) }))
      }, 50)
    }
    close() {
      this.readyState = 2
    }
  } as unknown as typeof EventSource
  const here = new URL(location.href)
  if (here.pathname === '/') {
    here.pathname = `/${SITES.find((s) => s.id === w.sc.site)?.name ?? ''}`
    history.replaceState(null, '', here)
  }
}
