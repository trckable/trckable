// First run, step 2: sites already added and waiting each get their own snippet
// behind an inline picker, the first visit on ANY of them moves on, and the
// header's Skip opens the dashboard and is remembered.
//
// It needs a server with no site at all, so it starts one of its own, on a
// fresh data directory.
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
const PORTS = PORT.onboardingMore

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

test('skip for now opens that site’s dashboard, and the first run stays away', async ({ page, browserName }) => {
  one = `one-${browserName}-${Date.now()}.test`
  const run = await openRun(page)
  await expect(run.getByRole('heading', { name: 'Which site first?' })).toBeVisible({ timeout: 15_000 })
  await run.getByLabel('Domain').fill(one)
  await page.keyboard.press('Enter')
  await expect(run.locator('.ob-progress')).toContainText('Add the code', { timeout: 15_000 })
  await expect(run.getByRole('combobox', { name: 'Your sites' })).toHaveCount(0)
  if (process.env.TRCKABLE_SHOTS) await page.screenshot({ path: `${process.env.TRCKABLE_SHOTS}/onboarding-skip-${browserName}.png` })
  await run.getByRole('button', { name: /Skip/ }).click()
  await expect(run).toBeHidden()
  await expect(page).toHaveURL(base + '/' + one)
  await page.goto(base + '/')
  await expect(page.getByRole('dialog', { name: 'Set up your first site' })).toHaveCount(0)
})

test('another site: two waiting sites, an inline picker in the sentence, the first visit on the second moves on, then Live', async ({ page, browserName }) => {
  const two = `two-${browserName}-${Date.now()}.test`
  // A second site added through the API, still waiting: with the first it resumes at step 2.
  await page.request.post(`${base}/api/v1/sites`, { data: { domain: two }, headers: { Cookie: `trckable_session=${cookie}` } })
  const run = await openRun(page)
  await expect(run.locator('.ob-progress')).toContainText('Add the code', { timeout: 15_000 })
  const card = run.getByRole('region', { name: 'Install trckable' })

  const pick = run.getByRole('combobox', { name: 'Your sites' })
  await expect(pick.locator('option')).toHaveCount(2, { timeout: 15_000 })
  await expect(pick).toHaveValue(/.+/)
  const sites = (await (await page.request.get(`${base}/api/v1/sites`)).json()).sites as { id: string; domain: string }[]
  const second = sites.find((s) => s.domain === two)!
  await pick.selectOption({ label: one })
  await expect(card.locator('pre').first()).toContainText(`data-site="${sites.find((s) => s.domain === one)!.id}"`)
  await pick.selectOption({ label: two })
  await expect(card.locator('pre').first()).toContainText(`data-site="${second.id}"`)
  // A visit on the second site moves on, for that site.
  await visit(page, second.id)
  await expect(run.getByRole('heading', { name: 'Your first visitor just arrived' })).toBeVisible({ timeout: 20_000 })
  await run.getByRole('button', { name: /Open my dashboard/ }).click()
  await expect(page).toHaveURL(new RegExp(`/${two.replace(/\./g, '\\.')}\\?view=live`))
  await expect(run).toBeHidden()
})
