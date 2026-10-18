// A viewer reads every page and is offered nothing that changes one: no
// Create, no Add a site, no saves in Settings, no edits to goals, funnels or
// notes, no keys, no people, no share links, no module switches. The server
// refuses all of it anyway (api/routes_test.go); this is the page not
// offering a button that would only come back 403.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from './fixtures'
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
  // WebKit on a busy machine sometimes drops a navigation ("internal error"): once more, then it is a failure.
  await page.goto(API + path).catch(() => page.goto(API + path))
  // The live stream keeps some browsers from ever calling the network idle,
  // and a wait for it can run to its limit on every page: a quiet half second
  // is enough once the page has loaded.
  await page.waitForLoadState('load')
  await page.waitForTimeout(500)
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
    // This browser's own choices (the tab's count, the sale chime, notices, the language) are kept in the browser, not on the server: a viewer has them too.
    const local = /^(Live count in the tab|Sale sound|Browser notices|Language)$/
    // A funnel's steps live in the address, not the database: taking one out
    // changes what the viewer looks at, nothing anyone else sees.
    for (const el of document.querySelectorAll('button:not(.funnel-steps *), [role="switch"], [role="menuitem"], a.btn')) {
      if (!shown(el) || !enabled(el)) continue
      const name = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || '').trim()
      if (local.test(name)) continue
      if (el.getAttribute('role') === 'switch') found.push('switch: ' + name)
      else if (re.test(name)) found.push(name)
    }
    // An editable settings field is a write too.
    for (const el of document.querySelectorAll('.window-body :is(input, textarea, select):not([type=search]):not([readonly])')) {
      if (shown(el) && enabled(el) && !local.test(el.getAttribute('aria-label') ?? '')) found.push('field: ' + (el.getAttribute('name') || el.getAttribute('aria-label') || el.id || 'unnamed'))
    }
    return found
  }, WRITES.source)
}

const PAGES = [
  '/example.com?view=briefing',
  // Addresses the old Data page made still open (the Briefing, or Explore for Full).
  '/example.com?view=data',
  '/example.com?view=live',
  '/example.com?mode=full',
  '/sites',
  '/example.com?account=sites',
  '/example.com?account=keys',
  '/example.com?account=people',
  ...['site', 'install', 'sharing', 'notes', 'payments', 'search', 'privacy', 'alerts'].map((t) => `/settings?site={site}&tab=${t}`),
]

test('a viewer is offered no create, edit or delete control anywhere', async ({ page }) => {
  test.setTimeout(180_000)
  const problems: string[] = []
  for (const path of PAGES) {
    await open(page, path.replace('{site}', site))
    for (const c of await writeControls(page)) problems.push(`${path}: ${c}`)
  }
  // The header's Create menu is not there at all, nor are keys and people.
  await open(page, '/example.com?view=briefing')
  await expect(page.getByRole('button', { name: /^create$/i })).toHaveCount(0)
  await open(page, '/example.com?account=profile')
  await expect(page.getByRole('dialog').getByRole('tab')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Settings for/ })).toHaveCount(0)
  expect(problems).toEqual([])
})

test('All sites has no Add a site for a viewer', async ({ page }) => {
  await open(page, '/sites')
  await expect(page.locator('.tm-row[data-site]').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Add a site' })).toHaveCount(0)
})

// The same search finds the owner's controls, so an empty list above means
// there were none, not that the search looked in the wrong place.
test('the search finds an owner\'s controls', async ({ page }) => {
  const owner = await session('owner')
  await page.context().addCookies([{ name: 'trckable_session', value: owner, url: API }])
  await page.goto(`${API}/settings?site=${site}&tab=site`)
  await page.waitForLoadState('load') // not "networkidle": the live stream can keep it from ever coming
  // The switches arrive with the tab's data, after the network first goes
  // quiet in WebKit: ask again until they are there.
  const switches = async () => (await writeControls(page)).filter((c) => c.startsWith('switch: ')).length
  await expect.poll(switches).toBeGreaterThan(3)
})

test('on a phone, a viewer on a site with no visit yet gets the account menu inside the screen', async ({ page, request }) => {
  const domain = `viewer-fresh-${Date.now()}.test`
  expect((await request.post(`${API}/api/v1/sites`, { headers: AUTH, data: { domain } })).ok()).toBeTruthy()
  await page.setViewportSize({ width: 375, height: 700 })
  await open(page, `/${domain}`)
  await page.getByRole('button', { name: 'Account' }).click()
  // The sheet slides up: its place is read once it has settled.
  const menu = page.getByRole('menu', { name: 'Account' })
  await expect.poll(async () => {
    const b = await menu.boundingBox()
    return !!b && b.x >= 0 && b.x + b.width <= 375 && b.y >= 0 && b.y + b.height <= 700
  }).toBe(true)
})

// The key is heard once the page has mounted its keys: ask again until the palette is there.
async function openPalette(page: Page) {
  const palette = page.getByRole('dialog', { name: /./ }).last()
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press('ControlOrMeta+k')
    await expect(palette).toBeVisible({ timeout: 1500 })
  }).toPass()
  return palette
}

// The ⌘K palette is a second way to every control: a viewer finds the reads
// and their own browser choices in it, and no row that creates or changes.
test('a viewer\'s palette has no Create row and no Settings row', async ({ page }) => {
  await open(page, '/example.com?view=briefing')
  const palette = await openPalette(page)
  const text = await palette.innerText()
  expect(text).not.toMatch(/^(New goal|New funnel|New note|Site settings|Settings ·)/im)
  // What a search for the changing words finds is nothing a viewer could use.
  for (const word of ['goal', 'funnel', 'settings', 'share', 'alerts']) {
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type(word)
    await page.waitForTimeout(150)
    expect(await palette.innerText(), word).not.toMatch(/^(New goal|New funnel|New note|Site settings|Settings ·)/im)
  }
  // The search does find what a viewer has: the reads and their own choices.
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('sign out')
  await expect(palette).toContainText('Sign out')
})

// The site list's ⋯ is the status page and the site itself: nothing that
// changes, nothing that arranges (the layout is saved for everyone).
test('a viewer\'s site row menu holds the status page and nothing that changes', async ({ page }) => {
  await open(page, '/example.com?view=briefing')
  await page.locator('#siteBtn').click()
  await page.getByRole('button', { name: /: options$/ }).first().click()
  const items = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim())
  expect(items.join('|')).toMatch(/Status page/)
  expect(items.filter((t) => /settings|share|widgets|pin|group|move|install/i.test(t))).toEqual([])
})

// An old link that opens the add-a-site wizard opens nothing for a viewer.
test('an old ?add=site link does not open the wizard for a viewer', async ({ page }) => {
  await open(page, '/example.com?add=site')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(/add a site/i)).toHaveCount(0)
})

// The same searches find the rows for the owner, so the empty result above means there were none.
test('the owner\'s palette does have the Create and Settings rows', async ({ page }) => {
  const owner = await session('owner')
  await page.context().addCookies([{ name: 'trckable_session', value: owner, url: API }])
  await page.goto(`${API}/example.com?view=briefing`)
  await page.waitForLoadState('load')
  await page.waitForTimeout(500)
  const palette = await openPalette(page)
  await page.keyboard.type('settings')
  await expect(palette).toContainText(/Settings ·/)
})
