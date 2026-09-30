// Full mode's two tabbed cards against a trckabled with the demo data (the same
// server the accessibility pass uses, so it is skipped unless
// TRCKABLE_A11Y_URL points at one):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test fullcharts
// Every chart tab draws, every chart answers a hover, every one has its table,
// the tabs answer the arrow keys and are remembered, a phone stacks the two
// cards, and Compact never loads any of it.
import { expect, test, type Page } from '@playwright/test'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'
const SHOTS = process.env.TRCKABLE_SHOTS // a folder: screenshots of the grid, for review

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

// Signing in is limited to ten tries in ten minutes from one address, and
// the accessibility pass needs its own: every browser here shares one
// session, made once by whichever worker gets there first.
async function session(): Promise<string> {
  const file = join(tmpdir(), `trckable-fullcharts-${new URL(BASE!).port}-${process.ppid}`)
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const res = await fetch(BASE + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  // The money cards need the revenue module; the demo has the payments.
  const cookie = `trckable_session=${value}`
  const sites = (await (await fetch(BASE + '/api/v1/sites', { headers: { cookie } })).json()) as { sites: { id: string }[] }
  await fetch(`${BASE}/api/v1/sites/${sites.sites[0].id}/modules/revenue`, {
    method: 'PUT',
    headers: { cookie, 'Content-Type': 'application/json', 'X-Trckable-Request': '1' },
    body: JSON.stringify({ enabled: true }),
  })
  writeFileSync(file, value)
  return value
}

async function signIn(page: Page): Promise<string> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: BASE! }])
  await page.goto(BASE + '/')
  return page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites[0].domain as string)
}

// Each Full chart is a tab of one of the two cards: where it is, and what it is called.
const TABS: [string, 'who' | 'what', string][] = [
  ['sources', 'who', 'Over time'],
  ['visitors', 'who', 'New vs returning'],
  ['rhythm', 'who', 'Hours'],
  ['money-map', 'who', 'Revenue map'],
  ['funnel', 'what', 'Visit to sale'],
  ['convert', 'what', 'Time to convert'],
  ['flow', 'what', 'Page flow'],
]

async function open(page: Page, card: 'who' | 'what', name: string) {
  const tab = page.locator(`[data-card=${card}]`).getByRole('tab', { name, exact: true })
  if ((await tab.count()) === 0) return null // a module the demo has off
  await tab.click()
  return page.locator(`[data-card=${card}]`)
}

for (const colorScheme of ['dark', 'light'] as const) {
  test(`every Full chart tab draws the demo data (${colorScheme})`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme })
    const domain = await signIn(page)
    await page.goto(`${BASE}/${domain}?mode=full`)
    await expect(page.locator('[data-card=what]').getByRole('tab', { name: 'Page flow' })).toBeVisible({ timeout: 20_000 })
    for (const [id, card, name] of TABS) {
      const panel = await open(page, card, name)
      if (!panel) continue
      await expect(panel.locator(`[data-chart="${id}"]`), name).toBeVisible({ timeout: 20_000 })
      // Every chart turns into a table and back.
      await panel.getByRole('button', { name: /show as a table/ }).click()
      await expect(panel.locator('table tbody tr').first(), name).toBeVisible()
      await panel.getByRole('button', { name: /show as a chart/ }).click()
    }
    // Real marks, not empty frames.
    const who = await open(page, 'who', 'Over time')
    expect(await who!.locator('[data-chart=sources] path').count()).toBeGreaterThan(3)
    // A hover names the bucket and every source in it.
    const svg = who!.locator('[data-chart=sources] svg')
    await svg.scrollIntoViewIfNeeded()
    const box = (await svg.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4)
    await expect(who!.locator('[data-chart=sources] .kit-tip')).toContainText(/Direct|Search/)
    // The keyboard walks the same buckets.
    await svg.focus()
    await page.keyboard.press('End')
    await expect(who!.locator('[data-chart=sources] .kit-tip')).toBeVisible()
    const flow = await open(page, 'what', 'Page flow')
    expect(await flow!.locator('[data-chart=flow] path.kit-band').count()).toBeGreaterThan(2)
    if (SHOTS) await page.locator('#cards').screenshot({ path: `${SHOTS}/e2e-full-${colorScheme}-${info.project.name}.png` })
  })
}

// Tabs are real tabs: one selected, the arrow keys, Home and End move between
// them, and the one picked is remembered for this site and card.
test('the tabs answer the arrow keys and are remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const domain = await signIn(page)
  await page.goto(`${BASE}/${domain}`)
  const who = page.locator('[data-card=who]')
  const tabs = who.locator('.tc-tabs').getByRole('tab')
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
  await expect(tabs.filter({ hasText: /^(Sources|Pages|Locations|Devices)$/ })).toHaveText(['Sources', 'Pages', 'Locations', 'Devices'])
  await expect(who.getByRole('tabpanel')).toBeVisible()
  // Only the selected tab is in the tab order.
  await expect(who.locator('.tc-tabs [role=tab][tabindex="0"]')).toHaveCount(1)
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(tabs.nth(1)).toBeFocused()
  await page.keyboard.press('End')
  await expect(tabs.nth(3)).toBeFocused()
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(tabs.first()).toBeFocused()
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(tabs.nth(3)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(tabs.first()).toBeFocused()
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  // The panel is named by its tab.
  await tabs.nth(2).click()
  await expect(who.getByRole('tabpanel')).toHaveAccessibleName('Locations')
  // Remembered: a reload opens on it.
  await page.reload()
  await expect(who.getByRole('tab', { name: 'Locations' })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
  // And a list's own small tabs work the same way.
  const sub = who.getByRole('tablist', { name: 'Locations' })
  await sub.getByRole('tab').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(sub.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
})

test('Compact has two cards with goals and what paid; Full adds tabs to both', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const domain = await signIn(page)
  await page.goto(`${BASE}/${domain}`)
  const what = page.locator('[data-card=what]')
  await expect(page.locator('[data-card]')).toHaveCount(2, { timeout: 20_000 })
  await expect(what.getByRole('tab', { name: 'Goals' })).toBeVisible()
  await expect(what.getByRole('tab', { name: 'Funnel' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /More numbers/ })).toHaveCount(0)
  await page.goto(`${BASE}/${domain}?mode=full`)
  await expect(what.getByRole('tab', { name: 'Page flow' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-card]')).toHaveCount(2)
})

test('on a phone the cards stack, the tab rows scroll sideways, and Compact loads none of Full', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const domain = await signIn(page)
  await page.goto(`${BASE}/${domain}?mode=full`)
  const cards = page.locator('[data-card]')
  await expect(page.locator('[data-card=what]').getByRole('tab', { name: 'Page flow' })).toBeVisible({ timeout: 20_000 })
  const widths = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  expect(new Set(widths).size, 'one column').toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'no sideways scroll').toBeLessThanOrEqual(0)
  const row = await page.locator('[data-card=what] [role=tablist]').first().evaluate((el) => ({ over: el.scrollWidth > el.clientWidth, overflow: getComputedStyle(el).overflowX }))
  expect(row.over, 'more tabs than fit').toBe(true)
  expect(row.overflow).toBe('auto')
  if (SHOTS) await page.locator('#cards').screenshot({ path: `${SHOTS}/e2e-full-375-${info.project.name}.png` })

  const chunks: string[] = []
  page.on('request', (r) => chunks.push(r.url()))
  await page.goto(`${BASE}/${domain}`)
  await expect(page.locator('.overview-chart')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1000)
  expect(chunks.filter((u) => /FullCards|ChartPanels|report\/charts/.test(u))).toEqual([])
})

// The two cards sit side by side on a desktop, one height, edge to edge; on a
// phone one under the other.
for (const width of [1440, 1280, 1024, 375]) {
  test(`the two cards fill their row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const domain = await signIn(page)
    await page.goto(`${BASE}/${domain}?mode=full`)
    await expect(page.locator('[data-card=what]').getByRole('tab', { name: 'Page flow' })).toBeVisible({ timeout: 20_000 })
    const grid = page.locator('#cards')
    const cells = await grid.evaluate((g) => {
      const box = g.getBoundingClientRect()
      return [...g.children].map((e) => {
        const r = e.getBoundingClientRect()
        return { left: r.left - box.left, right: box.right - r.right, top: Math.round(r.top), height: Math.round(r.height) }
      })
    })
    expect(cells).toHaveLength(2)
    for (const c of cells) {
      expect(Math.abs(c.left) < 1 || Math.abs(c.right) < 1, 'touches an edge').toBe(true)
    }
    if (width > 760) {
      expect(cells[0].top, 'one row').toBe(cells[1].top)
      expect(cells[0].height, 'one height').toBe(cells[1].height)
    } else {
      expect(cells[1].top, 'stacked').toBeGreaterThan(cells[0].top)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'no sideways scroll').toBeLessThanOrEqual(0)
  })
}

test('Create: A opens the menu, and a funnel lands in the address', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const domain = await signIn(page)
  await page.goto(`${BASE}/${domain}`)
  await expect(page.locator('.overview-chart')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-card=who] [role=tab]').first()).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('a')
  const menu = page.getByRole('menu', { name: 'Create something' })
  await expect(menu).toBeVisible()
  // A site is added from the site switcher, not from Create.
  await expect(menu.getByRole('menuitem')).toHaveText([/Goal/, /Funnel/, /Note/])
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  // The row has no Create button: ⋯ has it, and Goal opens the goal dialog
  // in place.
  const openCreate = async () => {
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('menu', { name: 'More' }).getByRole('menuitem', { name: /Create/ }).click()
  }
  await openCreate()
  await menu.getByRole('menuitem', { name: /Goal/ }).click()
  await expect(page.getByRole('dialog', { name: 'Add goals' })).toBeVisible()
  await page.keyboard.press('Escape')

  // A funnel: two steps, and Full opens on it with the steps in the URL.
  await openCreate()
  const funnelItem = menu.getByRole('menuitem', { name: /Funnel/ })
  test.skip((await funnelItem.count()) === 0, 'the demo site has Funnels off')
  await funnelItem.click()
  const dialog = page.getByRole('dialog', { name: 'New funnel' })
  for (let i = 0; i < 2; i++) {
    await dialog.getByText('+ Add step').click()
    await page.keyboard.press('Enter')
  }
  await dialog.getByRole('button', { name: 'Show the funnel' }).click()
  await expect(page).toHaveURL(/mode=full.*fs=/)
  await expect(page.locator('[data-card=what] .funnel-steps .chip')).toHaveCount(2, { timeout: 20_000 })
  await expect(page.locator('[data-card=what]').getByRole('tab', { name: 'Funnel' })).toHaveAttribute('aria-selected', 'true')
})
