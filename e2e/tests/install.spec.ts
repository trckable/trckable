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

test('add a site, pick a method, go cookieless, check, and see the first visit', async ({ page, browserName, context }) => {
  // WebKit on CI's Linux runners times out on the cookieless box now and then
  // (never locally); Chromium and Firefox still walk the whole flow. Tracked in
  // the backlog with the saved trace.
  test.skip(browserName === 'webkit' && !!process.env.CI, 'flaky on CI WebKit only')
  const domain = `install-${browserName}-${Date.now()}.example`
  await signIn(page)
  await page.goto(`${API}/example.com?account=sites`)
  await page.getByRole('button', { name: 'Add a site' }).first().click()

  // Step 1: the domain.
  const wizard = page.getByRole('dialog', { name: 'Add a site' })
  await expect(wizard.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await wizard.getByLabel('Domain').fill(`https://www.${domain}/pricing`)
  await expect(wizard.getByText(`We’ll count ${domain} and www/subdomains`)).toBeVisible()
  await wizard.getByLabel('Domain').press('Enter')
  await expect(wizard.getByRole('tablist', { name: 'How to install' })).toBeVisible()
  const site = await siteByDomain(page, domain)
  expect(site?.id).toMatch(/^tkb_/)

  // The new site's own dashboard: one calm card, no sample dashboard behind.
  const board = await page.context().newPage()
  await board.goto(`${API}/${domain}`)
  const card = board.getByRole('region', { name: 'Install trckable' })
  await expect(card.getByRole('heading', { name: 'Waiting for the first visit' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Check my site' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Copy a prompt for your AI editor' })).toBeVisible()
  await expect(board.getByRole('region', { name: 'Overview' })).toBeHidden()
  // The first screen's nudges are side cards, one at a time, never a line in
  // the page: Escape from inside puts one away, the next comes, and what was
  // put away stays away after a reload.
  const importCard = board.getByRole('complementary', { name: 'Import your history' })
  const weeklyCard = board.getByRole('complementary', { name: 'Weekly email' })
  await expect(importCard).toBeVisible()
  await expect(weeklyCard).toHaveCount(0)
  await importCard.getByRole('button', { name: 'Close' }).focus()
  await board.keyboard.press('Escape')
  await expect(importCard).toHaveCount(0)
  await expect(card).toBeVisible()
  await expect(weeklyCard).toBeVisible()
  await weeklyCard.getByRole('button', { name: 'Close' }).click()
  await expect(weeklyCard).toHaveCount(0)
  await board.reload()
  await expect(card.getByRole('heading', { name: 'Waiting for the first visit' })).toBeVisible()
  await expect(board.getByRole('complementary')).toHaveCount(0)
  await board.close()

  // Tabs: the script tag first, with this site's id and domain.
  const panel = wizard.getByRole('tabpanel')
  const scriptTag = (await panel.locator('pre').first().innerText()).trim()
  expect(scriptTag).toContain(`data-site="${site.id}"`)
  expect(scriptTag).toContain(`data-domain="${domain}"`)
  // Arrow keys move between tabs; npm is two numbered steps.
  await wizard.getByRole('tab', { name: 'Script tag' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(wizard.getByRole('tab', { name: 'Next.js' })).toHaveAttribute('aria-selected', 'true')
  await wizard.getByRole('tab', { name: 'npm / React' }).click()
  await expect(panel.locator('ol > li')).toHaveCount(2)
  expect(await panel.locator('pre').nth(1).innerText()).not.toContain('cookieless')
  // More… opens the searchable picker; a pick becomes a fifth tab.
  // The picker closes when the page scrolls under it (its button moved), and
  // the dialog may still be settling from the scroll the click itself made:
  // bring the button into view first, and open again if a late scroll shut it.
  const more = wizard.getByRole('button', { name: 'Every other way to install' })
  await more.scrollIntoViewIfNeeded()
  await expect(async () => {
    if (!(await page.getByRole('searchbox').isVisible())) await more.click()
    await page.getByRole('searchbox').fill('shopify', { timeout: 1000 })
    await page.getByRole('searchbox').press('Enter', { timeout: 1000 })
    await expect(wizard.getByRole('tab', { name: 'Shopify' })).toHaveAttribute('aria-selected', 'true', { timeout: 1000 })
  }).toPass({ timeout: 15_000 })

  // Cookieless: the dialog says what it costs; Cancel changes nothing.
  const box = wizard.getByRole('checkbox', { name: /Use cookieless tracking/ })
  await expect(box).toBeEnabled()
  await box.click()
  const ask = page.getByRole('dialog', { name: 'Use cookieless tracking?' })
  await expect(ask.getByRole('row', { name: /Returning visitors/ })).toContainText('each day new')
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(box).not.toBeChecked()

  const config = async () => (await (await page.request.get(`${API}/api/v1/sites/${site.id}/config`)).json()).consent_free
  const served = async () => (await (await page.request.get(`${API}/js/${site.id}.js`)).text()).includes('dataset.cookieless')
  expect(await config()).toBe(false)
  expect(await served()).toBe(false)

  await box.click()
  await page.getByRole('dialog', { name: 'Use cookieless tracking?' }).getByRole('button', { name: 'Use cookieless' }).click()
  await expect(box).toBeChecked()
  await expect.poll(config).toBe(true)
  expect(await served()).toBe(true)
  // The script tag is the same: the server applies the setting.
  await wizard.getByRole('tab', { name: 'Script tag' }).click()
  expect((await panel.locator('pre').first().innerText()).trim()).toBe(scriptTag)
  // A bundled install carries it, and says to rebuild.
  await wizard.getByRole('tab', { name: 'npm / React' }).click()
  await expect(panel.locator('pre').nth(1)).toContainText('cookieless')
  await expect(wizard).toContainText('Rebuild and deploy')
  // Unchecking asks too: the same comparison, going back to cookies.
  await box.click()
  const back = page.getByRole('dialog', { name: 'Use cookies again?' })
  await expect(back.getByRole('row', { name: /Browser storage/ })).toContainText('cookie')
  await back.getByRole('button', { name: 'Use cookies' }).click()
  await expect.poll(config).toBe(false)
  expect(await served()).toBe(false)
  await expect(panel.locator('pre').nth(1)).not.toContainText('cookieless')

  // Install with AI.
  await wizard.getByRole('button', { name: 'Show the prompt' }).click()
  await expect(wizard.locator('.inst-ai-prompt')).toContainText(site.id)

  // "I've installed it": what the check found, then waiting, then live.
  await page.route(`**/api/v1/sites/${site.id}/install/check`, (r) =>
    r.fulfill({ json: { url: `https://${domain}/`, status: 200, found: 'site', via: 'page', scripts: 0 } }),
  )
  await wizard.getByRole('button', { name: /I’ve installed it/ }).click()
  await expect(wizard.locator('[data-found="site"]')).toContainText('Script found')
  await expect(wizard).toContainText('Waiting for the first visit')

  const visitor = await context.browser()!.newPage()
  await visitor.goto(`http://127.0.0.1:18301/install/${site.id}`)
  await expect(wizard.locator('[data-live="1"]')).toBeVisible({ timeout: 20_000 })
  await expect(wizard.getByRole('heading', { name: 'Peekaboo! It works.' })).toBeVisible()
  await visitor.close()
})

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
