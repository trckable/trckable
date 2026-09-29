// A viewer reads every page and is offered nothing that changes one: no
// Create, no Add a site, no saves in Settings, no edits to goals, funnels or
// notes, no keys, no people, no share links, no module switches. The server
// refuses all of it anyway (api/routes_test.go); this is the page not
// offering a button that would only come back 403.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { API, TOKEN } from '../playwright.config'
import { session } from './session'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'viewer e2e password 1'
const AUTH = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }

let cookie = ''
let site = ''

// One worker for the file: each worker signs in once more, and signing in is limited.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  const email = `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'viewer'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 5) throw e
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  cookie = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
  expect(res.ok && cookie).toBeTruthy()
  // Something of each kind to edit, so an edit control would have a row to sit on.
  const sites = (await (await request.get(`${API}/api/v1/sites`, { headers: AUTH })).json()).sites as { id: string; domain: string }[]
  site = sites.find((s) => s.domain === 'example.com')!.id
  const base = `${API}/api/v1/sites/${site}`
  for (const m of ['goals', 'funnels', 'segments']) await request.put(`${base}/modules/${m}`, { headers: AUTH, data: { enabled: true } })
  await request.post(`${base}/annotations`, { headers: AUTH, data: { day: new Date().toISOString().slice(0, 10), text: 'viewer probe note' } })
  await request.post(`${base}/shares`, { headers: AUTH, data: { name: 'viewer probe link' } })
})

async function open(page: Page, path: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + path)
  // The live stream keeps some browsers from ever calling the network idle:
  // a quiet half second is enough once the page has loaded.
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => page.waitForTimeout(500))
}

// Words on a control that changes something. A viewer's page carries none.
const WRITES = /^(\+ ?)?(create|add a site|add site|new site|save|save changes|delete|remove|edit|rename|revoke|new key|create key|add key|add person|add people|new link|create link|make a link|turn on|turn off|add a note|add note|add goal|add a goal|save view|save funnel|connect|disconnect|reset|erase|start over)\b/i

// One pass in the page: every browser reads twenty pages well inside the
// test's time, where an await per control did not.
async function writeControls(page: Page): Promise<string[]> {
  return page.evaluate((writes) => {
    const re = new RegExp(writes, 'i')
    const shown = (el: Element) => el.checkVisibility()
    const enabled = (el: Element) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('fieldset:disabled')
    const found: string[] = []
    // A funnel's steps live in the address, not the database: taking one out
    // changes what the viewer looks at, nothing anyone else sees.
    for (const el of document.querySelectorAll('button:not(.funnel-steps *), [role="switch"], [role="menuitem"], a.btn')) {
      if (!shown(el) || !enabled(el)) continue
      const name = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || '').trim()
      if (el.getAttribute('role') === 'switch') found.push('switch: ' + name)
      else if (re.test(name)) found.push(name)
    }
    // An editable settings field is a write too.
    for (const el of document.querySelectorAll('.window-body :is(input, textarea, select):not([type=search]):not([readonly])')) {
      if (shown(el) && enabled(el)) found.push('field: ' + (el.getAttribute('name') || el.getAttribute('aria-label') || el.id || 'unnamed'))
    }
    return found
  }, WRITES.source)
}

const PAGES = [
  '/example.com',
  '/example.com?mode=full',
  '/all',
  '/example.com?account=sites',
  '/example.com?account=keys',
  '/example.com?account=people',
  ...['site', 'install', 'modules', 'sharing', 'notes', 'payments', 'search', 'privacy', 'alerts'].map((t) => `/settings?site={site}&tab=${t}`),
]

test('a viewer is offered no create, edit or delete control anywhere', async ({ page }) => {
  test.setTimeout(180_000)
  const problems: string[] = []
  for (const path of PAGES) {
    await open(page, path.replace('{site}', site))
    for (const c of await writeControls(page)) problems.push(`${path}: ${c}`)
  }
  // The header's Create menu is not there at all, nor are keys and people.
  await open(page, '/example.com')
  await expect(page.getByRole('button', { name: /^create$/i })).toHaveCount(0)
  await open(page, '/example.com?account=profile')
  await expect(page.getByRole('dialog').getByRole('tab')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Settings for/ })).toHaveCount(0)
  expect(problems).toEqual([])
})

// The same search finds the owner's controls, so an empty list above means
// there were none, not that the search looked in the wrong place.
test('the search finds an owner\'s controls', async ({ page }) => {
  const owner = await session('viewer')
  await page.context().addCookies([{ name: 'trckable_session', value: owner, url: API }])
  await page.goto(`${API}/settings?site=${site}&tab=modules`)
  await page.waitForLoadState('networkidle')
  expect((await writeControls(page)).filter((c) => c.startsWith('switch: ')).length).toBeGreaterThan(3)
})
