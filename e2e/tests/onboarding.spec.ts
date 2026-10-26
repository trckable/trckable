// The first run, end to end: a person with no site signs in, types a domain
// (it appears in the preview as they type), gets the install card, and the
// moment a real pageview lands on that site the flow says "Someone's here",
// then Continue opens Live mode showing that visit. Keyboard only.
//
// It needs a server with no site at all, so it starts one of its own (the
// shared one is provisioned with example.com), on a fresh data directory.
import { expect, test, type Locator, type Page } from './fixtures'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORT } from '../ports'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'first run e2e password 1'
const SHOTS = process.env.TRCKABLE_SHOTS // a folder: screenshots of each step, for review
const PORTS = PORT.onboarding

// One server per browser, and its tests in order: Skip first, while there
// is still no site, then the whole first run.
test.describe.configure({ mode: 'serial' })

let server: ChildProcess | undefined
let dataDir = ''
let base = ''
let cookie = ''
let verified = '' // the first run's site, once it has had its visit

test.beforeAll(async ({ browserName }) => {
  const data = mkdtempSync(join(tmpdir(), 'trckable-first-run-'))
  dataDir = data
  base = `http://127.0.0.1:${PORTS[browserName]}`
  const env = { ...process.env, TRCKABLE_DATA_DIR: data, TRCKABLE_GEO: 'off', TRCKABLE_LOG_LEVEL: 'warn' }
  execFileSync(BIN, ['admin', 'add-user', 'first@example.com', '--role', 'owner'], { input: PASSWORD + '\n', env, stdio: ['pipe', 'ignore', 'ignore'] })
  server = spawn(BIN, ['serve'], { env: { ...env, TRCKABLE_ADDR: base.slice(7) }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    if (await fetch(base + '/readyz').then((r) => r.ok, () => false)) break
    await new Promise((r) => setTimeout(r, 100))
  }
  const res = await fetch(base + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'first@example.com', password: PASSWORD }) })
  cookie = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
  if (!res.ok || !cookie) throw new Error(`sign in: ${res.status}`)
})

test.afterAll(() => {
  server?.kill()
})

/** A real visit: a page carrying the new site's snippet. It is served on a
 *  loopback address, as the install suite's page is: Chromium keeps a public
 *  origin from reaching a local server (Private Network Access). */
async function visit(page: Page, site: string) {
  const ctx = await page.context().browser()!.newContext()
  const p = await ctx.newPage()
  await p.route(`${base}/_first-visit`, (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Home</title><script defer data-site="${site}" data-dev src="${base}/js/${site}.js"></script><h1>Home</h1>`,
    }),
  )
  await p.goto(`${base}/_first-visit`)
  await p.waitForTimeout(1500) // the pageview leaves
  await ctx.close()
}

/** The step the progress row marks as the current one. */
async function expectStep(run: Locator, name: string) {
  await expect(run.locator('.ob-progress')).toContainText(name)
}

/** Two elements' horizontal centres, within a few pixels. */
async function expectCentred(page: Page, a: Locator, b: Locator) {
  const [x, y] = await Promise.all([a.boundingBox(), b.boundingBox()])
  const cx = (r: { x: number; width: number } | null) => r!.x + r!.width / 2
  expect(Math.abs(cx(x) - cx(y))).toBeLessThan(6)
  const vw = page.viewportSize()!.width
  expect(Math.abs(cx(y) - vw / 2)).toBeLessThan(12)
}

test('with no site the first run cannot be left, and stays on every address', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: base }])
  await page.goto(base + '/')
  const run = page.getByRole('dialog', { name: 'Set up your first site' })
  await expect(run).toBeVisible({ timeout: 15_000 })
  if (SHOTS) {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByLabel('Domain').fill('mysite.com')
    await page.screenshot({ path: `${SHOTS}/onboarding-375-${test.info().project.name}.png` })
  }
  await expectCentred(page, run.getByRole('heading', { name: 'Which site first?' }), run.locator('.ob-field'))
  // The page's main column is a plain column: no pill border across it (the step's class once collided with the site chip's).
  const main = run.locator('main')
  expect(await main.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')
  expect(await main.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('0px')
  // The header is the dashboard's: its 1440 px column and its height, and Skip has no fill at rest.
  await page.setViewportSize({ width: 1920, height: 1000 })
  const hd = await run.locator('.ob-hd').boundingBox()
  expect(hd!.width).toBeLessThanOrEqual(1440)
  expect(await run.locator('.ob-hd .hd').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(68)
  expect(await run.getByRole('button', { name: /Skip/ }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await page.setViewportSize({ width: 1280, height: 800 })
  // The header is the logo, the account and nothing about sites.
  await expect(run.locator('#siteBtn')).toHaveCount(0)
  await expect(run.getByRole('button', { name: /set up/i })).toHaveCount(0)
  // A placeholder domain is refused under the field, as typed, with no toast and no Retry.
  await run.getByLabel('Domain').fill('mybakery.example')
  await page.keyboard.press('Enter')
  await expect(run.locator('.field-err-msg')).toHaveText('mybakery.example is a placeholder. Enter your own site’s address.')
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  await expect(run.getByLabel('Domain')).toHaveValue('mybakery.example')
  await run.getByLabel('Domain').fill('')
  // Skip is there on every step; Esc does nothing, other addresses come back.
  await expect(run.getByRole('button', { name: /Skip/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(run).toBeVisible()
  for (const path of ['/settings', '/sites', '/nosuch.example']) {
    await page.goto(base + path)
    await expect(run).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(base + '/')
  }
  await page.goBack()
  await expect(run).toBeVisible()
  // The account stays reachable: Profile opens over it, Sign out is there.
  await run.getByRole('button', { name: 'Account', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'Account' }).getByText('Sign out')).toBeVisible()
  await page.getByRole('menu', { name: 'Account' }).getByText('Profile').first().click()
  await expect(page.getByRole('dialog', { name: /Account|Profile/i }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(run).toBeVisible()
})

test('Skip with no site lands on the empty page, no loop after a reload, and another account still gets its first run', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: base }])
  await page.goto(base + '/')
  const run = page.getByRole('dialog', { name: 'Set up your first site' })
  await expect(run).toBeVisible({ timeout: 15_000 })
  await run.getByRole('button', { name: /Skip/ }).click()
  const empty = page.getByRole('heading', { name: 'No sites yet' })
  await expect(empty).toBeVisible({ timeout: 15_000 })
  await expect(run).toHaveCount(0)
  await expect(page.locator('#siteBtn')).toHaveCount(0)
  if (SHOTS) {
    for (const [w, h] of [[1280, 800], [390, 800]]) {
      for (const scheme of ['dark', 'light'] as const) {
        await page.setViewportSize({ width: w, height: h })
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme })
        await page.screenshot({ path: `${SHOTS}/edge-${w}-${scheme}.png` })
      }
    }
  }
  // Reload, a new tab and deep links: the same page, the same address, no first run flashing back.
  for (const path of ['/', '/sites', '/nosuch.example']) {
    await page.goto(base + path)
    await expect(empty).toBeVisible({ timeout: 15_000 })
    await expect(run).toHaveCount(0)
    await expect(page).toHaveURL(base + path)
  }
  const tab = await page.context().newPage()
  await tab.goto(base + '/')
  await expect(tab.getByRole('heading', { name: 'No sites yet' })).toBeVisible({ timeout: 15_000 })
  await tab.close()
  // Sign out stays reachable from the empty page.
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'Account' }).getByText('Sign out')).toBeVisible()
  await page.keyboard.press('Escape')

  // A second account in the same browser: its own first run, the first account's skip does not carry over.
  const env = { ...process.env, TRCKABLE_DATA_DIR: dataDir, TRCKABLE_GEO: 'off' }
  const email = `second-owner-${browserName}@example.com`
  execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env, stdio: ['pipe', 'ignore', 'ignore'] })
  const res = await fetch(base + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const other = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
  await page.context().clearCookies()
  await page.context().addCookies([{ name: 'trckable_session', value: other, url: base }])
  await page.goto(base + '/')
  await expect(run).toBeVisible({ timeout: 15_000 })
  // Back to the first account: "Add your first site" on the empty page brings the first run back.
  await page.context().clearCookies()
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: base }])
  await page.goto(base + '/')
  await page.getByRole('button', { name: 'Add your first site' }).click()
  await expect(run).toBeVisible()
})

test('a first site, its install, its first visit, then Live', async ({ page, browserName }) => {
  const domain = `first-${browserName}-${Date.now()}.test`
  verified = domain
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: base }])
  await page.goto(base + '/')

  const run = page.getByRole('dialog', { name: 'Set up your first site' })
  await expect(run.getByRole('heading', { name: 'Which site first?' })).toBeVisible({ timeout: 15_000 })
  await expectStep(run, 'Your site')
  await expect(run.getByRole('button', { name: /Skip/ })).toBeVisible()

  // The domain appears in the preview as it is typed; Enter adds the site.
  const input = run.getByLabel('Domain')
  await expect(input).toBeFocused()
  await page.keyboard.type(`https://www.${domain}/pricing`)
  await input.blur()
  await expect(input).toHaveValue(domain)
  await input.focus()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/onboarding-1-site-${browserName}.png` })
  await expect(run.locator('.ob-j-site')).toContainText(domain)
  await page.keyboard.press('Enter')

  // Step 2: the install card, with this site's snippet.
  await expectStep(run, 'Add the code')
  const card = run.getByRole('region', { name: 'Install trckable' })
  await expect(run.getByRole('button', { name: /Check (now|again)/ })).toBeVisible()
  // One centred column: the status and the card share a horizontal centre.
  // A new site that cannot be reached yet is not scolded: a calm line waits, the warning only after Check now.
  await expect(run.getByText('Waiting for your first visit…')).toBeVisible()
  await page.waitForTimeout(4000)
  await expect(run.locator('.setup-status')).toHaveCount(0)
  await expect(run.getByText('Can’t reach your site')).toHaveCount(0)
  await expect(run.getByText('Waiting for your first visit…')).toBeVisible()
  const sites = (await (await page.request.get(`${base}/api/v1/sites`)).json()).sites as { id: string; domain: string }[]
  const site = sites.find((s) => s.domain === domain)
  expect(site?.id).toMatch(/^tkb_/)
  await expect(card.locator('pre').first()).toContainText(`data-site="${site!.id}"`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/onboarding-2-install-${browserName}.png` })

  // A real pageview moves it on by itself.
  await visit(page, site!.id)
  await expect(run.getByRole('heading', { name: 'Your first visitor just arrived' })).toBeVisible({ timeout: 20_000 })
  await expectStep(run, 'First visit')
  await expect(run.getByText('/_first-visit', { exact: true })).toBeVisible()
  await expect(run.getByText('Just now')).toBeVisible()
  // No side card or nudge over the celebration: they wait until the dashboard.
  await expect(page.getByRole('complementary')).toHaveCount(0)
  // Closing it leaves the focus on the page: move on from the heading.
  await run.getByRole('heading', { name: 'Your first visitor just arrived' }).focus()

  // Enter: straight to Live mode, where the visit is (no second screen).
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/${domain.replace(/\./g, '\\.')}\\?view=live`))
  await expect(run).toBeHidden()
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible({ timeout: 15_000 })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/onboarding-5-live-mode-${browserName}.png` })
})


test('after the first verified site, Add a site closes like any dialog and an unverified extra site never gates', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: base }])
  const wizard = page.getByRole('dialog', { name: 'Add a site' })
  const gate = page.getByRole('dialog', { name: 'Set up your first site' })
  await page.goto(`${base}/${verified}?add=site`)
  await expect(wizard).toBeVisible({ timeout: 15_000 })
  // Cancel, Esc and a click on the backdrop each close it.
  await wizard.getByRole('button', { name: 'Cancel' }).click()
  await expect(wizard).toBeHidden()
  await page.goto(`${base}/${verified}?add=site`)
  await expect(wizard).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(wizard).toBeHidden()
  await page.goto(`${base}/${verified}?add=site`)
  await expect(wizard).toBeVisible()
  await page.mouse.click(4, 4)
  await expect(wizard).toBeHidden()

  // A second site, left unverified: no gate, and it shows its own install screen.
  const second = `second-${browserName}-${Date.now()}.test`
  await page.goto(`${base}/${verified}?add=site`)
  await wizard.getByLabel('Domain').fill(second)
  await wizard.getByLabel('Domain').press('Enter')
  await wizard.getByRole('button', { name: 'Skip' }).click()
  await expect(wizard.getByRole('tablist', { name: 'How to install' })).toBeVisible({ timeout: 15_000 })
  await wizard.getByRole('button', { name: 'Later' }).click()
  await expect(page.locator('.setup-status').first()).toBeVisible({ timeout: 15_000 })
  await expect(gate).toHaveCount(0)
  for (const path of ['/settings', '/sites', '/' + verified]) {
    await page.goto(base + path)
    await expect(page.locator('.app')).toBeVisible({ timeout: 15_000 })
    await expect(gate).toHaveCount(0)
  }
  await page.goto(`${base}/${verified}`)
  await expect(page.locator('.setup-status')).toHaveCount(0)
})

test('/settings is not a page: an owner lands on the dashboard, a viewer is never held in the first run', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: base }])
  await page.goto(`${base}/settings`)
  await expect(page).toHaveURL(new RegExp(`/${verified.replace(/\./g, '\\.')}(\\?|$)`), { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(0)
  // The settings shortcut (the site menu has no row for it) opens that site's settings, over its dashboard.
  await expect(page.locator('#siteBtn')).toBeVisible()
  await page.locator('[data-key="settings"]').dispatchEvent('click')
  await expect(page.getByRole('dialog').first()).toBeVisible()

  const env = { ...process.env, TRCKABLE_DATA_DIR: dataDir, TRCKABLE_GEO: 'off' }
  const email = `viewer-${browserName}@example.com`
  execFileSync(BIN, ['admin', 'add-user', email, '--role', 'viewer'], { input: PASSWORD + '\n', env, stdio: ['pipe', 'ignore', 'ignore'] })
  const res = await fetch(base + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
  const ctx = await page.context().browser()!.newContext()
  await ctx.addCookies([{ name: 'trckable_session', value, url: base }])
  const v = await ctx.newPage()
  for (const path of ['/', '/settings']) {
    await v.goto(base + path)
    // The viewer lands on the site's dashboard (its switcher is there) and has no settings cog.
    await expect(v.getByRole('button', { name: verified })).toBeVisible({ timeout: 15_000 })
    await expect(v.getByRole('button', { name: /^Settings for/ })).toHaveCount(0)
    await v.locator('#siteBtn').click()
    await expect(v.locator('#siteMenu.on')).toBeVisible()
    await expect(v.locator('#siteMenu').getByRole('button', { name: 'Site settings' })).toHaveCount(0)
    await v.keyboard.press('Escape')
    await expect(v.getByRole('dialog', { name: 'Set up your first site' })).toHaveCount(0)
  }
  await ctx.close()
})
