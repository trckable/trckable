// The calendar behind "Custom dates": it stays inside the window, names each month once, shows every day's number,
// and its fields have no border. Chromium only. Pictures: DATEPICK_SHOTS=<folder>.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the calendar')

const SHOTS = process.env.DATEPICK_SHOTS

async function openCalendar(page: Page, width: number, scheme: 'dark' | 'light' = 'dark') {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('date-picker'), url: API }])
  await page.emulateMedia({ colorScheme: scheme })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&v=`)
  await openMenu(page)
  await page.locator('#perMenu').getByRole('button', { name: /^Custom dates/ }).click()
  await expect(page.locator('#perMenu .cal .mk-cm')).toBeVisible()
}

// The header's period is hidden on a phone; its menu is the sheet from the bottom there, opened the way the page opens it.
async function openMenu(page: Page) {
  const phone = (page.viewportSize()?.width ?? 1440) <= 600
  if (phone) await page.locator('#perBtn').evaluate((el: HTMLElement) => el.click())
  else await page.locator('#perBtn').click()
}

for (const [width, scheme] of [[1440, 'dark'], [1024, 'dark'], [1440, 'light'], [390, 'dark']] as const) {
  test(`the calendar at ${width} px (${scheme}) stays inside, names each month once and shows every day`, async ({ page }) => {
    await openCalendar(page, width, scheme)
    const menu = page.locator('#perMenu')
    const box = (await menu.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(-0.5)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5)

    const months = page.locator('#perMenu .mk-cm .month:visible')
    const shown = await months.count()
    expect(shown).toBe(width > 600 ? 2 : 1)
    // One title per month, and the arrows sit on that row.
    await expect(page.locator('#perMenu .mth:visible')).toHaveCount(shown)
    await expect(page.locator('#perMenu .mth:visible b')).toHaveText(Array(shown).fill(/^[A-Z][a-z]+ \d{4}$/))
    await expect(page.locator('#perMenu .mth:visible .mn:not([disabled]):visible').first()).toBeVisible()

    // Every day shows its number, in a colour that is not its own fill.
    const days = await page.locator('#perMenu .mk-cm .month:visible .mk-day:not(.out)').evaluateAll((els) =>
      els.map((el, i) => {
        const s = getComputedStyle(el)
        return { i, text: el.textContent, color: s.color, bg: s.backgroundColor, w: el.getBoundingClientRect().width }
      }),
    )
    expect(days.length).toBeGreaterThanOrEqual(28 * shown)
    for (const d of days) {
      expect(d.text).toMatch(/^\d{1,2}$/)
      expect(d.w).toBeGreaterThan(10)
      expect(d.color).not.toBe(d.bg)
    }

    if (SHOTS) {
      // A range over a month's end, so the ribbon's corners show.
      const month = (n: number) => page.locator('#perMenu .mk-cm .month:visible').nth(n)
      await month(0).locator('.mk-day:not(.out)').nth(shown === 2 ? 19 : 4).click()
      await month(shown - 1).locator('.mk-day:not(.out)').nth(shown === 2 ? 9 : 11).click()
      await openMenu(page)
      await page.locator('#perMenu').getByRole('button', { name: /^Custom dates/ }).click()
      await expect(page.locator('#perMenu .mk-day.mk-edge')).toHaveCount(2)
      await page.screenshot({ path: `${SHOTS}/calendar-${width}-${scheme}.png` })
    }
  })
}

test('the start and end fields have no border; the one being picked has a soft fill', async ({ page }) => {
  await openCalendar(page, 1440)
  const fields = page.locator('#perMenu .cf .fld')
  await expect(fields).toHaveCount(2)
  for (const f of await fields.all()) await expect(f).toHaveCSS('border-top-width', '0px')
  const on = await fields.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const off = await fields.last().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(on).not.toBe(off)
  await expect(fields.first()).toHaveCSS('outline-style', 'none')
})

test('a range has round ends, future days are dimmed and cannot be picked, the arrows move and Escape closes', async ({ page }) => {
  await openCalendar(page, 1440)
  const day = (n: number) => page.locator('#perMenu .mk-cm .month:visible').first().locator('.mk-day:not(.out)').nth(n - 1)
  await day(3).click()
  await day(9).click()
  await openMenu(page)
  await page.locator('#perMenu').getByRole('button', { name: /^Custom dates/ }).click()
  const edges = page.locator('#perMenu .mk-day.mk-edge')
  await expect(edges).toHaveCount(2)
  await expect(edges.first()).toHaveCSS('border-top-left-radius', '8px')
  await expect(edges.last()).toHaveCSS('border-top-right-radius', '8px')
  // The days after today are disabled.
  const future = page.locator('#perMenu .mk-day:disabled')
  const nFuture = await future.count()
  if (nFuture) await expect(future.first()).toHaveCSS('opacity', '0.45')
  // Arrow keys move between the days; Escape closes the menu.
  await edges.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#perMenu .mk-day:focus')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('#perMenu.on')).toHaveCount(0)
})
