// The accuracy suite's harness: a real trckabled, a real site served beside
// it, and scripted visitors whose true numbers are known before they arrive.
//
// Every scenario gets its own site, so what the report says is exactly what
// that scenario did. A scenario states its Truth (visitors, sessions, page
// views, bounce rate, goals, sources, pages) and `settled` compares it with
// what trckabled reports, field by field, exactly. The one tolerance is time:
// a number of seconds is a range, because a browser's clock is not ours.
import { test as base, expect, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer as http, type IncomingMessage, type Server as Http, type ServerResponse } from 'node:http'
import { createServer as tcp } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { proxy } from '../../packages/trckable/dist/server.js'

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const BIN = process.env.TRCKABLE_BIN ?? resolve(HERE, '../../server/bin/trckabled')
const TOKEN = 'accuracy-token'

export const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = tcp()
    s.once('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => ok(port))
    })
  })
}

// ---- the server --------------------------------------------------------------

export interface Site {
  id: string
  key: string // the proxy key
  domain: string
}

export interface Row {
  value: string
  visitors: number
  sessions?: number
  pageviews?: number
}

export interface Report {
  kpis: { visitors: number; sessions: number; pageviews: number; bounce_rate: number; avg_session_s: number }
  dims: Record<string, Row[]>
  goals: Row[]
}

export interface Ev {
  seq: number
  kind: 'pageview' | 'goal' | 'engagement'
  path: string
  visitor: string
  session: string
  pageview?: string
  goal?: string
  engaged_ms?: number
}

/** One trckabled with its own data folder, started and stopped by the test. */
export class Server {
  readonly dir = mkdtempSync(join(tmpdir(), 'trckable-accuracy-'))
  port = 0
  private proc?: ChildProcess

  get url() {
    return `http://127.0.0.1:${this.port}`
  }

  private env() {
    return {
      ...process.env,
      TRCKABLE_DATA_DIR: this.dir,
      TRCKABLE_ADDR: `127.0.0.1:${this.port}`,
      TRCKABLE_API_TOKEN: TOKEN,
      TRCKABLE_GEO: 'off',
      TRCKABLE_LOG_LEVEL: 'warn',
    }
  }

  /** Starts it, and waits until it answers. The port is kept across restarts. */
  async start() {
    if (!this.port) this.port = await freePort()
    this.proc = spawn(BIN, ['serve'], { env: this.env(), stdio: 'ignore' })
    for (let i = 0; i < 200; i++) {
      try {
        if ((await fetch(this.url + '/readyz')).ok) return
      } catch {
        /* not yet */
      }
      await sleep(100)
    }
    throw new Error('trckabled did not become ready')
  }

  /** Stops it: SIGKILL is a crash (nothing gets to say goodbye), SIGTERM a deploy. */
  async stop(signal: 'SIGKILL' | 'SIGTERM' = 'SIGTERM') {
    const p = this.proc
    if (!p || p.exitCode !== null) return
    const done = new Promise<void>((r) => p.once('exit', () => r()))
    p.kill(signal)
    await done
  }

  async dispose() {
    await this.stop('SIGKILL')
    rmSync(this.dir, { recursive: true, force: true })
  }

  private async api(path: string, init: RequestInit = {}) {
    // Right after a start the analytics store is still warming up (503): ask again.
    for (let i = 0; ; i++) {
      const r = await fetch(this.url + '/api/v1' + path, {
        ...init,
        headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...init.headers },
      })
      if (r.status === 503 && i < 100) {
        await sleep(300)
        continue
      }
      if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${r.status} ${await r.text()}`)
      return r
    }
  }

  /** A new site, named for the scenario so a failure says where it was. */
  async addSite(name: string): Promise<Site> {
    const domain = `${name}.accuracy.test`
    const si = (await (await this.api('/sites', { method: 'POST', body: JSON.stringify({ Domain: domain }) })).json()) as { id: string; proxy_key: string }
    return { id: si.id, domain, key: si.proxy_key }
  }

  async module(site: Site, id: string, enabled: boolean) {
    await this.api(`/sites/${site.id}/modules/${id}`, { method: 'PUT', body: JSON.stringify({ enabled }) })
  }

  /** A site's settings, changed the way Settings → Data & privacy changes them. */
  async config(site: Site, patch: Record<string, unknown>) {
    const now = (await (await this.api(`/sites/${site.id}/config`)).json()) as Record<string, unknown>
    await this.api(`/sites/${site.id}/config`, { method: 'PUT', body: JSON.stringify({ ...now, ...patch }) })
  }

  async report(site: Site): Promise<Report> {
    const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
    const q = `from=${day(1)}&to=${day(0)}&tz=UTC&deep=1`
    const r = (await (await this.api(`/sites/${site.id}/report?${q}`)).json()) as { current: Report }
    return r.current
  }

  /** The stored events, oldest first. The newest thousand: a scenario with more asks by path prefix. */
  async events(site: Site, prefix = ''): Promise<Ev[]> {
    const r = (await (await this.api(`/sites/${site.id}/events?limit=1000&path_prefix=${encodeURIComponent(prefix)}`)).json()) as { events: Ev[] }
    return r.events.sort((a, b) => a.seq - b.seq)
  }

  async crawlers(site: Site): Promise<unknown> {
    const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
    return (await this.api(`/sites/${site.id}/report/crawlers?from=${day(1)}&to=${day(0)}&tz=UTC`)).json()
  }

  /** What a browser's tracker (or anyone's server) sends. */
  async send(payload: Record<string, unknown>, headers: Record<string, string> = {}): Promise<number> {
    const r = await fetch(this.url + '/api/e', {
      method: 'POST',
      headers: { 'user-agent': CHROME_UA, ...headers },
      body: JSON.stringify(payload),
    })
    return r.status
  }
}

// ---- the site beside it --------------------------------------------------------

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => void | Promise<void>

export const doc = (title: string, body = '', head = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`

export type Mode =
  | 'direct' // the script and its events go straight to trckabled
  | 'site' // the same, with the site's own script (the one that carries its modules)
  | 'proxy' // the script and /api/e come from the site's own origin, forwarded by trckable/server with the key
  | 'nokey' // the same, but the proxy has no key
  | 'plain' // a reverse proxy that passes everything through and adds nothing

/** A small web server for the scenarios' pages, one per worker. */
export class Web {
  readonly routes = new Map<string, Handler>()
  private http?: Http
  port = 0

  constructor(private server: Server) {}

  get url() {
    return `http://127.0.0.1:${this.port}`
  }

  async start() {
    this.port = await freePort()
    this.http = http(async (req, res) => {
      const url = new URL(req.url ?? '/', this.url)
      try {
        const h = this.routes.get(req.method + ' ' + url.pathname)
        if (!h) return void res.writeHead(404).end()
        await h(req, res, url)
      } catch (e) {
        res.writeHead(500).end(String(e))
      }
    })
    await new Promise<void>((r) => this.http!.listen(this.port, '127.0.0.1', () => r()))
  }

  async stop() {
    await new Promise((r) => (this.http ? this.http.close(r) : r(null)))
  }

  /** A page at a path. */
  page(path: string, html: string) {
    this.routes.set('GET ' + path, (_q, res) => void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html))
  }

  /** A file from disk, served as it is. */
  file(path: string, file: string, type = 'text/javascript') {
    this.routes.set('GET ' + path, async (_q, res) => {
      const { readFile } = await import('node:fs/promises')
      res.writeHead(200, { 'content-type': type }).end(await readFile(file))
    })
  }

  /** Every path under a prefix answers with the same page, as a single-page app's host does. */
  spa(prefix: string, paths: string[], html: string) {
    for (const p of paths) this.page(prefix + p, html)
  }

  /**
   * The script tag a page carries, and the routes that serve it when it comes
   * from the site's own origin. `prefix` keeps scenarios apart.
   */
  tag(site: Site, mode: Mode, prefix: string, extra = ''): string {
    const s = this.server
    if (mode === 'direct') return `<script defer src="${s.url}/js/t.js" data-site="${site.id}" data-dev ${extra}></script>`
    if (mode === 'site') return `<script defer src="${s.url}/js/${site.id}.js" data-dev ${extra}></script>`
    this.sameOrigin(site, mode, prefix)
    return `<script defer src="${prefix}/js/t.js" data-site="${site.id}" data-api="${prefix}/api/e" data-dev ${extra}></script>`
  }

  /** `/js/t.js` and `/api/e` under a prefix, forwarded the way the mode says. */
  sameOrigin(site: Site, mode: 'proxy' | 'nokey' | 'plain', prefix: string) {
    const target = this.server.url
    this.routes.set(`GET ${prefix}/js/t.js`, async (_q, res) => {
      const r = await fetch(target + '/js/t.js')
      res.writeHead(r.status, { 'content-type': 'application/javascript' }).end(Buffer.from(await r.arrayBuffer()))
    })
    const forward = mode === 'proxy' ? proxy({ host: target, proxyKey: site.key }) : mode === 'nokey' ? proxy({ host: target, proxyKey: '' }) : null
    this.routes.set(`POST ${prefix}/api/e`, async (req, res, url) => {
      const body = await read(req)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      headers.set('x-real-ip', (req.socket.remoteAddress ?? '').replace('::ffff:', ''))
      let out: Response
      if (forward) out = await forward(new Request(url, { method: 'POST', headers, body }))
      else {
        // The reverse proxy of a hand-made setup: the body and the browser's own headers, nothing else.
        const fwd: Record<string, string> = { 'content-type': 'text/plain', 'user-agent': headers.get('user-agent') ?? '' }
        for (const h of ['dnt', 'sec-gpc']) if (headers.get(h)) fwd[h] = headers.get(h)!
        out = await fetch(target + '/api/e', { method: 'POST', headers: fwd, body })
      }
      const h: Record<string, string> = {}
      out.headers.forEach((v, k) => (h[k] = v))
      const text = Buffer.from(await out.arrayBuffer())
      res.writeHead(out.status, h).end(text)
    })
  }
}

async function read(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

// ---- the truth ---------------------------------------------------------------

/** What a scenario knows, exactly. Leave a field out and it is not asserted. */
export interface Truth {
  visitors?: number
  sessions?: number
  pageviews?: number
  bounce?: number // the bounce rate, 0 to 1
  /** The one tolerance: the average session length, in seconds, as a range. */
  seconds?: [number, number]
  /** Time a page was in front of the visitor, in milliseconds, summed over page views: the one tolerance besides seconds. */
  engagedMs?: [number, number]
  /** Goal events, by name, counted from the event log: exactly the ones that happened. */
  goals?: Record<string, number>
  /** Visitors who reached each goal. */
  converted?: Record<string, number>
  /** Page views in order, as paths. */
  pages?: string[]
  /** Sessions by channel, source, medium, campaign, referrer and entry page: the whole table, nothing more. */
  channels?: Record<string, number>
  sources?: Record<string, number>
  mediums?: Record<string, number>
  campaigns?: Record<string, number>
  referrers?: Record<string, number>
  entries?: Record<string, number>
}

export interface Check {
  name: string
  expected: unknown
  actual: unknown
  ok: boolean
}

const table = (rows: Row[] | undefined) => Object.fromEntries((rows ?? []).map((r) => [r.value, r.sessions ?? r.visitors]))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sorted = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))

/** Every field of the truth, set against what the server says. */
export function checks(t: Truth, r: Report, evs: Ev[], prefix = ''): Check[] {
  const out: Check[] = []
  const add = (name: string, expected: unknown, actual: unknown, ok = same(expected, actual)) => out.push({ name, expected, actual, ok })
  const k = r.kpis
  if (t.visitors !== undefined) add('visitors', t.visitors, k.visitors)
  if (t.sessions !== undefined) add('sessions', t.sessions, k.sessions)
  if (t.pageviews !== undefined) add('pageviews', t.pageviews, k.pageviews)
  if (t.bounce !== undefined) add('bounce rate', t.bounce, k.bounce_rate, Math.abs(k.bounce_rate - t.bounce) < 1e-9)
  if (t.seconds) add('session seconds', t.seconds, k.avg_session_s, k.avg_session_s >= t.seconds[0] && k.avg_session_s <= t.seconds[1])
  if (t.engagedMs) {
    const best = new Map<string, number>()
    for (const e of evs) if (e.kind === 'engagement' && e.pageview) best.set(e.pageview, Math.max(best.get(e.pageview) ?? 0, e.engaged_ms ?? 0))
    const total = [...best.values()].reduce((a, b) => a + b, 0)
    add('engaged ms', t.engagedMs, total, total >= t.engagedMs[0] && total <= t.engagedMs[1])
  }
  if (t.goals) {
    const n: Record<string, number> = {}
    for (const e of evs) if (e.kind === 'goal' && e.goal) n[e.goal] = (n[e.goal] ?? 0) + 1
    add('goal events', sorted(t.goals), sorted(n))
  }
  if (t.converted) add('visitors who converted', sorted(t.converted), sorted(Object.fromEntries(r.goals.map((g) => [g.value, g.visitors]))))
  if (t.pages) add('page views, in order', t.pages, evs.filter((e) => e.kind === 'pageview').map((e) => e.path.slice(prefix.length) || '/'))
  const dim = (name: string, want: Record<string, number> | undefined, key: string) => want && add(name, sorted(want), sorted(table(r.dims[key])))
  dim('sessions by channel', t.channels, 'channel')
  dim('sessions by source', t.sources, 'source')
  dim('sessions by medium', t.mediums, 'medium')
  dim('sessions by campaign', t.campaigns, 'campaign')
  dim('sessions by referrer', t.referrers, 'referrer')
  if (t.entries) {
    const rel = Object.fromEntries(Object.entries(table(r.dims.entry_page)).map(([k, v]) => [k.startsWith(prefix) ? k.slice(prefix.length) || '/' : k, v]))
    add('sessions by entry page', sorted(t.entries), sorted(rel))
  }
  return out
}

// ---- the fixtures --------------------------------------------------------------

export interface Lab {
  server: Server
  web: Web
  /** Waits for the server to say what the truth says, then for a moment longer to prove nothing more arrives. */
  settled(site: Site, truth: Truth, o?: { prefix?: string; timeout?: number; server?: Server }): Promise<Check[]>
}

/** The first line of a scenario: what kind of scenario it is, for the score. */
export function kind(k: 'browser' | 'server') {
  base.info().annotations.push({ type: 'kind', description: k })
}

export const test = base.extend<{ lab: Lab }, { shared: { server: Server; web: Web } }>({
  shared: [
    async ({}, use) => {
      const server = new Server()
      await server.start()
      const web = new Web(server)
      await web.start()
      await use({ server, web })
      await web.stop()
      await server.dispose()
    },
    { scope: 'worker' },
  ],
  lab: async ({ shared }, use) => {
    const lab: Lab = {
      ...shared,
      async settled(site, truth, o = {}) {
        const server = o.server ?? shared.server
        const deadline = Date.now() + (o.timeout ?? 20_000)
        const look = async () => checks(truth, await server.report(site), await server.events(site), o.prefix)
        let last = await look()
        while (!last.every((c) => c.ok) && Date.now() < deadline) {
          await sleep(500)
          last = await look()
        }
        // Everything it says should be true, and stay true: what is wrong shows up late.
        await sleep(1500)
        last = await look()
        base.info().annotations.push({ type: 'accuracy', description: JSON.stringify(last) })
        for (const c of last) expect.soft(c.ok, `${c.name}: expected ${JSON.stringify(c.expected)}, the server says ${JSON.stringify(c.actual)}`).toBe(true)
        return last
      },
    }
    await use(lab)
  },
})

export { expect }

/** One scenario's site and the pages it serves, all under its own prefix. */
export interface Scene {
  site: Site
  prefix: string
  tag: string
  /** The address of a page, for page.goto. */
  url(path: string): string
  /** A page with the script on it. `head` goes after the script. */
  page(path: string, body: string, head?: string): void
  /** A page without the script. */
  bare(path: string, body: string): void
}

export async function scene(lab: Lab, name: string, mode: Mode = 'direct', extra = ''): Promise<Scene> {
  const site = await lab.server.addSite(name)
  const prefix = '/' + name
  const tag = lab.web.tag(site, mode, prefix, extra)
  return {
    site,
    prefix,
    tag,
    url: (p) => lab.web.url + prefix + p,
    page: (p, body, head = '') => lab.web.page(prefix + p, doc(name, body, tag + head)),
    bare: (p, body) => lab.web.page(prefix + p, doc(name, body)),
  }
}

/**
 * The visitor switches to another tab: the page is hidden, and still alive.
 * (A page that is closed outright cannot be checked in headless Chromium, which
 * drops what a page sends as it unloads; Firefox and WebKit are checked that way.)
 */
export async function hide(page: Page, hidden = true) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true })
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

/** A visitor's browser, for a scenario that needs a second person. */
export async function person(page: Page) {
  const ctx = await page.context().browser()!.newContext()
  return { page: await ctx.newPage(), ctx }
}
