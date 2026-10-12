// Shared by the settings-*.spec.ts suites: a signed-in owner, a site of its own
// (so no other suite's counts move), a visit a real browser could have made,
// and the settings dialog opened on a section.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createServer, type Server as NetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type APIRequestContext, type BrowserContext, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

export const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

export type TestSite = { id: string; domain: string }

export const pageFor = (site: TestSite) => `<!doctype html><title>t</title>
<a id="goal" href="#" data-trckable-goal="signup" onclick="event.preventDefault()">Sign up</a>
<a id="out" href="https://elsewhere.example/page" onclick="event.preventDefault()">Out</a>
<a id="file" href="/files/guide.pdf" onclick="event.preventDefault()">Guide</a>
<a id="buy" href="https://buy.stripe.com/test_abc" onclick="event.preventDefault()">Buy</a>
<form id="form" action="#" onsubmit="event.preventDefault()"><input name="email"><button id="send">Send</button></form>
<script defer data-site="${site.id}" src="${API}/js/${site.id}.js"></script>`

/** A browser that is not mistaken for a robot, on a page that carries the site's script.
 *  The page is the site's address, answered here; the server it talks to is the real one, reached from
 *  the test's side (a browser on a public-looking page may not call a server on this machine). */
export async function realPage(context: BrowserContext, site: TestSite, path = '/home', html = pageFor(site)) {
  const page = await context.newPage()
  // The tracker stays out of automated browsers; this one has to look like a person's.
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Content-Type' } })
    }
    return route.fulfill({ response: await route.fetch() })
  })
  await page.route(`http://${site.domain}/**`, (r) => r.fulfill({ contentType: 'text/html', body: html }))
  await page.goto(`http://${site.domain}${path}`)
  await page.waitForFunction(() => typeof (window as unknown as { trckable?: unknown }).trckable === 'function')
  return page
}


export async function signIn(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('settings-audit'), url: API }])
}

/** A site of its own, signed in. `first` sends the one visit that takes the dashboard past "waiting for the first visit". */
export async function newSite(page: Page, prefix: string, first = true): Promise<TestSite> {
  await signIn(page)
  const domain = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.status()).toBe(201)
  const site = { id: ((await made.json()) as { id: string }).id, domain }
  if (first) {
    expect((await visit(page.request, site, '/first')).ok()).toBe(true)
    await waitForEvents(page.request, site, 1)
  }
  return site
}

/** One page view, the way the tracker sends it. `age` is how many ms ago it happened. */
export function visit(request: APIRequestContext, site: TestSite, path: string, extra: { headers?: Record<string, string>; age?: number; id?: string; referrer?: string } = {}) {
  const id = extra.id ?? Math.random().toString(36).slice(2, 10)
  return request.post(`${API}/api/e`, {
    headers: { 'User-Agent': UA, ...extra.headers },
    data: { s: site.id, k: 'pv', u: `https://${site.domain}${path}`, id, v: `k3j2.${id}`, a: extra.age ?? 0, r: extra.referrer ?? '' },
  })
}

export async function recent(request: APIRequestContext, site: TestSite) {
  const res = await request.get(`${API}/api/v1/sites/${site.id}/events?limit=200`, { headers: H })
  expect(res.ok()).toBe(true)
  return ((await res.json()) as { events: { path: string; ts: number | string; country?: string }[] }).events
}

export async function paths(request: APIRequestContext, site: TestSite) {
  return (await recent(request, site)).map((e) => e.path).sort()
}

export async function waitForEvents(request: APIRequestContext, site: TestSite, n: number) {
  await expect.poll(async () => (await recent(request, site)).length, { timeout: 15_000 }).toBe(n)
}

/** Settings opens over the dashboard; the old address still opens it on a section. */
export async function openSettings(page: Page, site: TestSite, tab: string) {
  await page.goto(`${API}/settings?site=${site.id}&tab=${tab}`)
  await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 15_000 })
}

export async function getConfig(request: APIRequestContext, site: TestSite) {
  const res = await request.get(`${API}/api/v1/sites/${site.id}/config`, { headers: H })
  expect(res.ok()).toBe(true)
  return (await res.json()) as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// A trckabled of its own with a mail server it can reach, for the suites that
// need email (the shared test server has none, and giving it one would change
// every suite that shows what a new site's alerts are). The binary is the same.

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
export const OWNER_PASSWORD = 'settings audit password 1'

/** What an SMTP server of five commands keeps: every message, as it arrived. */
export type Mailbox = { messages: string[]; port: number; close: () => Promise<void> }

export async function startMailbox(): Promise<Mailbox> {
  const messages: string[] = []
  const sockets = new Set<import('node:net').Socket>()
  const srv: NetServer = createServer((sock) => {
    sockets.add(sock)
    sock.on('close', () => sockets.delete(sock))
    sock.on('error', () => undefined)
    sock.write('220 sink ESMTP\r\n')
    let buf = ''
    let data: string[] | null = null
    sock.on('data', (chunk) => {
      buf += chunk.toString('latin1')
      for (;;) {
        const i = buf.indexOf('\r\n')
        if (i < 0) return
        const line = buf.slice(0, i)
        buf = buf.slice(i + 2)
        if (data) {
          if (line === '.') {
            messages.push(data.join('\r\n'))
            data = null
            sock.write('250 queued\r\n')
          } else data.push(line.startsWith('..') ? line.slice(1) : line)
          continue
        }
        const cmd = line.toUpperCase()
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) sock.write('250 sink\r\n')
        else if (cmd.startsWith('DATA')) {
          data = []
          sock.write('354 go on\r\n')
        } else if (cmd.startsWith('QUIT')) sock.end('221 bye\r\n')
        else sock.write('250 ok\r\n')
      }
    })
  })
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok))
  const port = (srv.address() as { port: number }).port
  return {
    messages,
    port,
    close: () =>
      new Promise((ok) => {
        for (const s of sockets) s.destroy()
        srv.close(() => ok())
      }),
  }
}

/** A message as a person reads it: headers decoded, the body's quoted-printable undone. */
export function readMail(raw: string) {
  const [head, ...rest] = raw.split('\r\n\r\n')
  // Whitespace between two encoded words is not part of the text (RFC 2047).
  const unfolded = head.replace(/\r\n[ \t]+/g, ' ').replace(/(\?=)\s+(?==\?utf-8\?)/gi, '$1')
  const header = (name: string) => new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(unfolded)?.[1] ?? ''
  const word = (s: string) =>
    s.replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_m, enc: string, t: string) =>
      enc.toLowerCase() === 'b' ? Buffer.from(t, 'base64').toString('utf8') : Buffer.from(t.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'),
    )
  const body = rest
    .join('\r\n\r\n')
    .replace(/=\r\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
  return { to: header('To'), subject: word(header('Subject')), body: Buffer.from(body, 'latin1').toString('utf8'), raw }
}

export type OwnServer = { url: string; token: string; cookie: string; stop: () => Promise<void> }

/** A trckabled on a free port with its own data directory, an owner, and mail sent to `smtpPort`. */
export async function startServer(smtpPort: number): Promise<OwnServer> {
  const dir = mkdtempSync(join(tmpdir(), 'trckable-audit-'))
  const free = await new Promise<number>((ok) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port
      s.close(() => ok(p))
    })
  })
  const token = 'audit-' + Math.random().toString(36).slice(2)
  const email = `owner-${Date.now()}@example.com`
  const env = {
    ...process.env,
    TRCKABLE_DATA_DIR: dir,
    TRCKABLE_ADDR: `127.0.0.1:${free}`,
    TRCKABLE_BASE_URL: `http://127.0.0.1:${free}`,
    TRCKABLE_API_TOKEN: token,
    TRCKABLE_SMTP_URL: `smtp://127.0.0.1:${smtpPort}`,
    TRCKABLE_MAIL_FROM: 'trckable@example.com',
    TRCKABLE_GEO: 'off',
    TRCKABLE_LOG_LEVEL: 'warn',
  }
  execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: OWNER_PASSWORD + '\n', env, stdio: ['pipe', 'ignore', 'ignore'] })
  const child: ChildProcess = spawn(BIN, ['serve'], { env, stdio: 'ignore' })
  const url = `http://127.0.0.1:${free}`
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url + '/readyz')).ok) break
    } catch {
      /* not up yet */
    }
    if (i > 150) throw new Error('the server of its own did not start')
    await new Promise((r) => setTimeout(r, 200))
  }
  const res = await fetch(url + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: OWNER_PASSWORD }) })
  const cookie = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
  if (!res.ok || !cookie) throw new Error(`sign in on its own server: ${res.status}`)
  return {
    url,
    token,
    cookie,
    stop: () =>
      new Promise((ok) => {
        child.once('exit', () => ok())
        child.kill('SIGTERM')
        setTimeout(() => ok(), 5000)
      }),
  }
}
