// The install flow, end to end: add a site in the wizard, switch install tabs,
// turn cookieless mode on (the site's setting and its served script change;
// the script tag does not), say "I've installed it", and watch a real visit
// from a page carrying the snippet turn it live.
//
// One thing is stood in for: the homepage check. The server reads
// https://<domain>/ through a client that refuses this machine and private
// networks (so nobody can point it inward), which a local test page is. That
// check is covered against a local page in Go (TestCheckOnDemandFinds…);
// here its answer is given at the browser, and everything else is real.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'install e2e password 1'

// Signing in is limited to ten tries in ten minutes from one address, shared
// with the other suites: every browser here uses one owner and one session,
// made once by whichever gets there first (the way live.spec does it).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'install-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `install-${Date.now()}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 5) throw e
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

async function signIn(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: API }])
}

const siteByDomain = async (page: Page, domain: string) => {
  const r = await page.request.get(`${API}/api/v1/sites`)
  const sites = (await r.json()).sites as { id: string; domain: string }[]
  return sites.find((s) => s.domain === domain)!
}


// The account window's primary buttons keep their colour on hover, with the
// icon centred on the text (a list's row style once leaked onto them).
test('Create key and Add someone keep their look on hover', async ({ page }) => {
  await signIn(page)
  for (const [tab, name] of [['keys', 'Create key'], ['people', 'Add someone']] as const) {
    await page.goto(`${API}/example.com?account=${tab}`)
    const btn = page.getByRole('button', { name, exact: true })
    await expect(btn).toBeVisible()
    // The tab swaps the button for a new one when its list arrives (an empty
    // list centres it): read only after that, or the read lands on the old,
    // removed button, whose style is an empty string.
    await expect(page.locator('.people [aria-busy="true"]')).toHaveCount(0)
    // A transition still running would read as a change; wait for the ends.
    const settled = () => btn.evaluate((b) => Promise.all(b.getAnimations().map((a) => a.finished)).then(() => getComputedStyle(b).backgroundColor))
    const before = await settled()
    expect(before).toMatch(/^rgb/)
    await btn.hover()
    expect(await settled()).toBe(before)
    const [icon, box] = await Promise.all([btn.locator('svg').boundingBox(), btn.boundingBox()])
    expect(Math.abs(icon!.y + icon!.height / 2 - (box!.y + box!.height / 2))).toBeLessThan(2)
  }
})

// The Install step of Add a site is small: it fits one screen at 1440x900 with no scrolling of its own, has one
// primary action (which checks, then goes on to Revenue) and a quiet Later.
test('the Install step fits 1440x900 without scrolling, with one primary action', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page)
  await page.goto(`${API}/example.com?add=site`)
  const wizard = page.getByRole('dialog', { name: 'Add a site' })
  await expect(wizard).toBeVisible({ timeout: 15_000 })
  const domain = `compact-${Date.now()}.test`
  await wizard.getByLabel('Domain').fill(domain)
  await wizard.getByLabel('Domain').press('Enter')
  await wizard.getByRole('button', { name: 'Skip' }).click()
  await expect(wizard.getByRole('heading', { name: new RegExp(domain.replace(/\./g, '\\.')) })).toBeVisible({ timeout: 15_000 })
  await expect(wizard.getByRole('tablist', { name: 'How to install' })).toBeVisible()
  await expect(wizard.getByRole('switch', { name: 'Cookieless' })).toBeVisible()
  await expect(wizard.getByRole('button', { name: 'Copy prompt' })).toBeVisible()
  // Settled (the step eases to its height), then the dialog has nothing to scroll.
  await expect
    .poll(() => wizard.evaluate((el) => el.scrollHeight - el.clientHeight), { message: 'the dialog scrolls inside itself' })
    .toBeLessThanOrEqual(0)
  // One primary action and a quiet Later; the duplicate Next: revenue is gone.
  await expect(wizard.locator('.dialog-actions .btn.primary')).toHaveCount(1)
  await expect(wizard.getByRole('button', { name: 'Later' })).toBeVisible()
  await expect(wizard.getByRole('button', { name: /Next: revenue|do it later/ })).toHaveCount(0)
  // "I've installed it" checks, and goes on to Revenue (the suite's server cannot reach the site, so it offers Continue anyway first).
  await wizard.getByRole('button', { name: /I.ve installed it/ }).click()
  await wizard.getByRole('button', { name: /Continue anyway/ }).click({ timeout: 20_000 })
  await expect(wizard.getByRole('heading', { name: 'Attribute revenue' })).toBeVisible()
})

// The dialog says what the site runs and opens on that tab; a tab picked by hand stays; a site the server is unsure of
// gets no line and the default tab. The server's read is stood in for at the browser (see the note at the top).
for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`the Install step opens on the stack the site runs at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size)
    await signIn(page)
    let stack = 'wordpress'
    await page.route('**/install/stack', (route) => route.fulfill({ json: { stack } }))
    const open = async () => {
      await page.goto(`${API}/example.com?add=site`)
      const wizard = page.getByRole('dialog', { name: 'Add a site' })
      await expect(wizard).toBeVisible({ timeout: 15_000 })
      const domain = `stack-${Date.now()}.test`
      await wizard.getByLabel('Domain').fill(domain)
      await wizard.getByLabel('Domain').press('Enter')
      await wizard.getByRole('button', { name: 'Skip' }).click()
      await expect(wizard.getByRole('tablist', { name: 'How to install' })).toBeVisible({ timeout: 15_000 })
      return { wizard, domain }
    }
    const first = await open()
    await expect(first.wizard.getByText(`${first.domain} runs WordPress`)).toBeVisible()
    await expect(first.wizard.getByRole('tab', { name: 'WordPress' })).toHaveAttribute('aria-selected', 'true')
    await page.screenshot({ path: `/private/tmp/shots/analyse-after-${size.width}.png` })
    await first.wizard.getByRole('tab', { name: 'Script tag' }).click()
    await expect(first.wizard.getByRole('tab', { name: 'Script tag' })).toHaveAttribute('aria-selected', 'true')

    stack = ''
    const second = await open()
    await expect(second.wizard.getByText(/ runs /)).toHaveCount(0)
    await page.screenshot({ path: `/private/tmp/shots/analyse-before-${size.width}.png` })
    await expect(second.wizard.getByRole('tab', { name: 'Script tag' })).toHaveAttribute('aria-selected', 'true')
    await expect
      .poll(() => second.wizard.evaluate((el) => el.scrollWidth - el.clientWidth), { message: 'the dialog scrolls sideways' })
      .toBeLessThanOrEqual(0)
  })
}

// A link from the site scan on the landing page opens the wizard with the domain filled in and
// Continue ready; a domain owned elsewhere gets one calm line. The link's extras leave the address.
test('?add=site&domain= opens the wizard with the domain filled in and focus on Continue', async ({ page }) => {
  await signIn(page)
  await page.goto(`${API}/?add=site&domain=https://www.Scanned-Site.test/pricing&taken=1`)
  const wizard = page.getByRole('dialog', { name: 'Add a site' })
  await expect(wizard.getByLabel('Domain')).toHaveValue('scanned-site.test', { timeout: 15_000 })
  await expect(wizard.getByRole('button', { name: 'Continue' })).toBeFocused()
  await expect(wizard.getByText(/already added to another account/)).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  await wizard.getByLabel('Domain').fill('other-site.test')
  await expect(wizard.getByText(/already added to another account/)).toHaveCount(0)
})

test('?add=site&domain= with a domain that cannot be added opens the wizard empty', async ({ page }) => {
  await signIn(page)
  await page.goto(`${API}/example.com?add=site&domain=not%20a%20domain`)
  const wizard = page.getByRole('dialog', { name: 'Add a site' })
  await expect(wizard.getByLabel('Domain')).toHaveValue('', { timeout: 15_000 })
  expect(new URL(page.url()).search).toBe('')
})
