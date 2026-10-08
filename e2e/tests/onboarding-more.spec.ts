// First run, step 2: another site can be added while the first waits, each gets
// a chip and its own snippet, the first visit on ANY of them moves on, and
// "Skip for now" opens the dashboard and is remembered.
//
// It needs a server with no site at all, so it starts one of its own, on a
// fresh data directory.
import { expect, test, type Locator, type Page } from './fixtures'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'first run e2e password 1'
const SHOTS = process.env.TRCKABLE_SHOTS // a folder: screenshots of each step, for review
const PORTS = { chromium: 18321, firefox: 18322, webkit: 18323 } as Record<string, number>

// One server per browser, its tests in order.
test.describe.configure({ mode: 'serial' })

let server: ChildProcess | undefined
let dataDir = ''
let base = ''
let cookie = ''

test.beforeAll(async ({ browserName }) => {
  const data = mkdtempSync(join(tmpdir(), 'trckable-first-run-more-'))
  dataDir = data
  base = `http://127.0.0.1:${PORTS[browserName]}`
  const env = { ...process.env, TRCKABLE_DATA_DIR: data, TRCKABLE_GEO: 'off', TRCKABLE_LOG_LEVEL: 'warn' }
  execFileSync(BIN, ['admin', 'add-user', 'more@example.com', '--role', 'owner'], { input: PASSWORD + '\n', env, stdio: ['pipe', 'ignore', 'ignore'] })
  server = spawn(BIN, ['serve'], { env: { ...env, TRCKABLE_ADDR: base.slice(7) }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    if (await fetch(base + '/readyz').then((r) => r.ok, () => false)) break
    await new Promise((r) => setTimeout(r, 100))
  }
  const res = await fetch(base + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'more@example.com', password: PASSWORD }) })
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


let one = '' // the first site, added by the skip test and still waiting

async function openRun(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: base }])
  await page.goto(base + '/')
  return page.getByRole('dialog', { name: 'Set up your first site' })
}

test('skip for now opens All sites, and the first run stays away', async ({ page, browserName }) => {
  one = `one-${browserName}-${Date.now()}.example`
  const run = await openRun(page)
  await expect(run.getByRole('heading', { name: 'Which site first?' })).toBeVisible({ timeout: 15_000 })
  await run.getByLabel('Domain').fill(one)
  await page.keyboard.press('Enter')
  await expect(run.getByRole('img', { name: 'Step 2 of 3' })).toBeVisible({ timeout: 15_000 })
  await expect(run.getByText('Testing on localhost? Add data-dev to the script tag.')).toBeVisible()
  await expect(run.getByRole('tablist', { name: 'Your sites' })).toHaveCount(0)
  if (process.env.TRCKABLE_SHOTS) await page.screenshot({ path: `${process.env.TRCKABLE_SHOTS}/onboarding-skip-${browserName}.png` })
  await run.getByRole('button', { name: 'Skip for now — open my dashboard' }).click()
  await expect(run).toBeHidden()
  await expect(page).toHaveURL(base + '/all')
  await page.goto(base + '/')
  await expect(page.getByRole('dialog', { name: 'Set up your first site' })).toHaveCount(0)
})

test('another site: a chip each, the first visit on the second moves on, then Live', async ({ page, browserName }) => {
  const two = `two-${browserName}-${Date.now()}.example`
  // A fresh browser context has not skipped: the waiting site resumes at step 2.
  const run = await openRun(page)
  await expect(run.getByRole('img', { name: 'Step 2 of 3' })).toBeVisible({ timeout: 15_000 })
  const card = run.getByRole('region', { name: 'Install trckable' })
  await expect(run.getByRole('tablist', { name: 'Your sites' })).toHaveCount(0)

  await run.getByRole('button', { name: '+ Add another site' }).click()
  const field = run.getByLabel('Another site')
  await field.fill('not a domain')
  await field.press('Enter')
  await expect(run.locator('.field-err-msg')).toContainText('no spaces')
  await field.fill(one)
  await field.press('Enter')
  await expect(run.locator('.field-err-msg')).toContainText('already have')
  await field.fill(`https://www.${two}/x`)
  await field.press('Enter')

  const chips = run.getByRole('tablist', { name: 'Your sites' })
  await expect(chips.getByRole('tab')).toHaveCount(2, { timeout: 15_000 })
  await expect(chips.getByRole('tab', { name: new RegExp(two) })).toHaveAttribute('aria-selected', 'true')
  await expect(chips.getByRole('tab', { name: new RegExp(`${one}.*waiting`) })).toBeVisible()
  const sites = (await (await page.request.get(`${base}/api/v1/sites`)).json()).sites as { id: string; domain: string }[]
  const second = sites.find((s) => s.domain === two)!
  await expect(card.locator('pre').first()).toContainText(`data-site="${second.id}"`)
  await chips.getByRole('tab', { name: new RegExp(one) }).click()
  await expect(card.locator('pre').first()).toContainText(`data-site="${sites.find((s) => s.domain === one)!.id}"`)
  const shots = process.env.TRCKABLE_SHOTS
  if (shots) {
    await run.getByRole('button', { name: '+ Add another site' }).click()
    await run.getByLabel('Another site').fill('bad one')
    await run.getByLabel('Another site').press('Enter')
    for (const [name, size, scheme] of [['wide-light', { width: 1280, height: 900 }, 'light'], ['phone-dark', { width: 390, height: 844 }, 'dark'], ['phone-light', { width: 390, height: 844 }, 'light'], ['wide-dark', { width: 1280, height: 900 }, 'dark']] as const) {
      await page.setViewportSize(size)
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme })
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${shots}/onboarding-more-${name}.png`, fullPage: true })
    }
    await page.setViewportSize({ width: 1280, height: 720 })
    await run.getByRole('button', { name: 'Cancel' }).click()
  }

  // A visit on the second site moves on, for that site.
  await visit(page, second.id)
  await expect(run.getByRole('heading', { name: 'Someone’s here.' })).toBeVisible({ timeout: 20_000 })
  await run.getByRole('button', { name: /Continue/ }).click()
  await expect(page).toHaveURL(new RegExp(`/${two.replace(/\./g, '\\.')}\\?view=live`))
  await expect(run).toBeHidden()
})
