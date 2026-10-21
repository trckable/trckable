// The notifications panel: rows under their day with only a time, one row for each time a site was down (red while it
// goes on), a ⋯ on every alert row (mute it for the site, change it), one Settings link in the footer; at a phone's width and a desktop's.
import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the bell')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'bell panel e2e password 1'

async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'bell-panel-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `bellsmooth-${Date.now()}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 4) throw e
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

let cookie = ''
test.beforeAll(async () => {
  cookie = await session()
})


const SHOTS = process.env.NOTIF_SHOTS // a prefix: also save the open panel as /private/tmp/shots/notif-<prefix>-<width>.png

for (const width of [1440, 390, 360]) {
  test(`at ${width} px the panel groups by day, tells each outage once, and its ⋯ mutes or changes the alert`, async ({ page }) => {
    test.setTimeout(90_000)
    const now = Math.floor(Date.now() / 1000)
    let siteId = ''
    await page.route(/\/api\/v1\/sites\/[^/]+\/milestones(\?|$)/, (route) => {
      siteId = /sites\/([^/]+)\//.exec(route.request().url())![1]
      return route.fulfill({ json: { enabled: true, milestones: [], moment: null } })
    })
    await page.route(/\/api\/v1\/sites\/[^/]+\/mentions(\?|$)/, (route) => route.fulfill({ json: { mentions: [] } }))
    const out = (id: string, started: number, ended: number | null) => ({ id: `${id}${width}`, site: siteId, kind: 'down', started_at: started, ended_at: ended, cause: 'timeout', expected_visits: null, note: '' })
    await page.route(/\/api\/v1\/incidents(\?|$)/, (route) =>
      route.fulfill({
        json: {
          incidents: siteId
            ? [out('open', now - 90, null), out('today', now - 1500, now - 900), out('yesterday', now - 90_000 - 600, now - 90_000), out('older', now - 3 * 86_400 - 1800, now - 3 * 86_400 - 600)]
            : [],
        },
      }),
    )
    const saved: unknown[] = []
    await page.route(/\/api\/v1\/sites\/[^/]+\/alerts(\?|$)/, (route) => {
      if (route.request().method() === 'PUT') {
        saved.push(route.request().postDataJSON())
        return route.fulfill({ json: {} })
      }
      return route.fulfill({ json: { alerts: [{ id: 'al1', site_id: siteId, kind: 'stopped', enabled: true, target: 'me@example.com', threshold: 6, last_fired: 0, created_at: 1 }], kinds: ['stopped'] } })
    })
    await page.setViewportSize({ width, height: 844 })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=live&v=`)
    await expect(page.locator('#bellDot')).toBeVisible({ timeout: 20_000 })
    const menu = page.locator('#bellMenu.on, aside.cd.on')
    await page.locator('#bellBtn').click()
    await expect(menu.locator('.nf').first()).toBeVisible()
    await page.waitForTimeout(400)
    if (SHOTS) await page.screenshot({ path: `/private/tmp/shots/notif-${SHOTS}-${width}-panel.png` })
    await expect(page.locator('#bellDot')).toHaveText('4')
    await expect(menu.locator('.nf')).toHaveCount(4)

    // Days, then rows with only their time.
    await expect(menu.locator('.nfdy')).toHaveText(['Today', 'Yesterday', /^\w{3} \d{1,2} \w{3}/])
    const titles = await menu.locator('.nft b').allTextContents()
    expect(titles[0]).toMatch(/^history\.example down since \d\d:\d\d$/)
    expect(titles[1]).toBe('history.example was down 10m')
    await expect(menu.locator('.nf.bad')).toHaveCount(1)
    await expect(menu.locator('.nf').nth(1).locator('small')).toHaveText(/^\d\d:\d\d–\d\d:\d\d$/)

    // The footer is one link.
    await expect(menu.locator('.nff button')).toHaveCount(1)

    // Nothing runs off the side at this width.
    const fits = await menu.evaluate((el) => {
      const box = el.getBoundingClientRect()
      return [...el.querySelectorAll('.nfx')].every((b) => b.getBoundingClientRect().right <= box.right + 1) && el.scrollWidth <= el.clientWidth + 1
    })
    expect(fits).toBe(true)

    // The filter is one quiet button in the header row beside Mark all read, not chips and a select in the list; its popover has Show and Site.
    await expect(menu.locator('.nfc, select')).toHaveCount(0)
    const filter = menu.getByRole('button', { name: 'Filter' })
    await expect(filter).toBeVisible()
    const head = await Promise.all([filter.boundingBox(), menu.getByRole('button', { name: 'Mark all read' }).boundingBox()])
    expect(Math.abs((head[0]!.y + head[0]!.height / 2) - (head[1]!.y + head[1]!.height / 2))).toBeLessThan(6)
    await expect(menu.locator('.nfact')).toHaveCount(0)
    await filter.click()
    await expect(page.getByRole('group', { name: 'Show' }).getByRole('menuitemradio')).toHaveText(['All', 'Down', 'Busy', 'Milestones'])
    await expect(page.getByRole('group', { name: 'Site' }).getByRole('menuitemradio').first()).toHaveText('All sites') // the account has several sites
    if (SHOTS) {
      await page.waitForTimeout(500)
      await page.screenshot({ path: `/private/tmp/shots/notif-${SHOTS}-${width}-filter.png` })
    }
    await page.getByRole('menuitemradio', { name: 'Busy', exact: true }).click()
    await expect(menu.locator('.nfact')).toHaveText('Busy')
    await expect(menu.locator('.xnone')).toHaveText('Nothing here')
    expect(await page.evaluate(() => localStorage.getItem('trckable.bell.filter'))).toContain('busy')
    await menu.getByRole('button', { name: 'Clear filter' }).click()
    await expect(menu.locator('.nfact')).toHaveCount(0)
    await expect(menu.locator('.nf')).toHaveCount(4)
    await page.evaluate(() => localStorage.removeItem('trckable.bell.filter'))
    if (width <= 640) await expect(menu.locator('.cdh').getByRole('button', { name: 'Close' })).toBeVisible()

    // The ⋯ by keyboard: Enter opens its choices, Escape shuts them and leaves the list open.
    const more = menu.locator('.nfx').first()
    const tops = () => menu.locator('.nf').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    const before = await tops()
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem')).toHaveText(['Mute this for this site', 'Change this alert'])
    // It floats over the list: no row moves.
    expect(await tops()).toEqual(before)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem')).toHaveCount(0)
    await expect(menu).toBeVisible()
    await expect(more).toBeFocused()

    // Mute: the same alert Settings edits is switched off for that site.
    await more.click()
    if (SHOTS) {
      await page.waitForTimeout(500)
      await page.screenshot({ path: `/private/tmp/shots/notif-${SHOTS}-${width}-menu.png` })
    }
    await page.getByRole('menuitem', { name: 'Mute this for this site' }).click()
    await expect.poll(() => saved.length).toBe(1)
    expect(saved[0]).toMatchObject({ id: 'al1', kind: 'stopped', enabled: false })
    await expect(page.getByText(/^Muted for history\.example/)).toBeVisible()

    // Change: Settings open on Alerts.
    await more.click()
    await page.getByRole('menuitem', { name: 'Change this alert' }).click()
    await expect(page).toHaveURL(/settings=alerts/)
    // Settings open at that alert.
    await expect(page.locator('.al-kind[data-kind="stopped"]')).toBeVisible()
    await expect(page.locator('.al-kind[data-kind="stopped"] :focus')).toHaveCount(1)
  })
}
