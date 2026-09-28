// The first run, end to end: a person with no site signs in, types a domain
// (it appears in the preview as they type), gets the install card, and the
// moment a real pageview lands on that site the flow says "Someone's here",
// then "You're live" opens Live mode showing that visit. Keyboard only.
//
// It needs a server with no site at all, so it starts one of its own (the
// shared one is provisioned with example.com), on a fresh data directory.
import { expect, test, type Page } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'first run e2e password 1'
const SHOTS = process.env.TRCKABLE_SHOTS // a folder: screenshots of each step, for review
const PORTS = { chromium: 18311, firefox: 18312, webkit: 18313 } as Record<string, number>

// One server per browser, and its tests in order: Skip first, while there
// is still no site, then the whole first run.
test.describe.configure({ mode: 'serial' })

let server: ChildProcess | undefined
let base = ''
let cookie = ''

test.beforeAll(async ({ browserName }) => {
  const data = mkdtempSync(join(tmpdir(), 'trckable-first-run-'))
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

test('Skip for now leaves the first run, and Esc does too', async ({ page }) => {
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
  await page.keyboard.press('Escape')
  await expect(run).toBeHidden()
})

test('a first site, its install, its first visit, then Live', async ({ page, browserName }) => {
  const domain = `first-${browserName}-${Date.now()}.example`
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: base }])
  await page.goto(base + '/')

  const run = page.getByRole('dialog', { name: 'Set up your first site' })
  await expect(run.getByRole('heading', { name: 'Which site first?' })).toBeVisible({ timeout: 15_000 })
  await expect(run.getByRole('img', { name: 'Step 1 of 3' })).toBeVisible()
  await expect(run.getByRole('button', { name: /Skip for now/ })).toBeVisible()

  // The domain appears in the preview as it is typed; Enter adds the site.
  const input = run.getByLabel('Domain')
  await expect(input).toBeFocused()
  await page.keyboard.type(`https://www.${domain}/pricing`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/onboarding-1-site-${browserName}.png` })
  await expect(run.getByRole('figure', { name: `A preview of the dashboard for ${domain}` })).toBeVisible()
  await page.keyboard.press('Enter')

  // Step 2: the install card, with this site's snippet.
  await expect(run.getByRole('img', { name: 'Step 2 of 3' })).toBeVisible({ timeout: 15_000 })
  const card = run.getByRole('region', { name: 'Install trckable' })
  await expect(card.getByRole('button', { name: 'Check my site' })).toBeVisible()
  const sites = (await (await page.request.get(`${base}/api/v1/sites`)).json()).sites as { id: string; domain: string }[]
  const site = sites.find((s) => s.domain === domain)
  expect(site?.id).toMatch(/^tkb_/)
  await expect(card.locator('pre').first()).toContainText(`data-site="${site!.id}"`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/onboarding-2-install-${browserName}.png` })

  // A real pageview moves it on by itself.
  await visit(page, site!.id)
  await expect(run.getByRole('heading', { name: 'Someone’s here.' })).toBeVisible({ timeout: 20_000 })
  await expect(run.getByRole('img', { name: 'Step 3 of 3' })).toBeVisible()
  await expect(run.locator('.ob-feed')).toContainText('/')
  await expect(run.locator('.ob-tag')).toHaveText('Live')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/onboarding-3-here-${browserName}.png` })

  // Enter, Enter: "You're live", then Live mode, where the visit is.
  await page.keyboard.press('Enter')
  await expect(run.getByRole('heading', { name: 'You’re live.' })).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/onboarding-4-live-${browserName}.png` })
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/${domain.replace(/\./g, '\\.')}\\?view=live`))
  await expect(run).toBeHidden()
  await expect(page.getByRole('region', { name: 'Live', exact: true })).toBeVisible({ timeout: 15_000 })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/onboarding-5-live-mode-${browserName}.png` })
})

