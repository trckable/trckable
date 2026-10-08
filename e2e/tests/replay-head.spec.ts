// Replay's playhead on the main chart: a lime line that fades out upwards, a
// chip naming the moment, the dot on the line's value, and what has not been
// played drawn dim instead of hidden. The key numbers show a dash, not 0, until
// something has happened. And the comparison menu: set, clear, set another.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('replay-head'), url: API }])
})

async function playing(page: Page, path: string, speed = 'slow') {
  await page.addInitScript((id) => localStorage.setItem('tkb_replay_speed', id), speed)
  await page.goto(API + path)
  const chart = page.locator('.overview-chart .chart-wrap')
  await expect(chart.locator('svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Replay this period/ }).click()
  await expect(chart).toHaveAttribute('data-locked', 'true')
  return chart
}

test('the playhead is a gradient line with a chip, a dot on the line and a dim future', async ({ page }) => {
  const chart = await playing(page, `/${HISTORY_DOMAIN}?view=data`, 'fast')
  // The line takes its colour from the gradient, not a flat white.
  await expect.poll(() => chart.locator('.chart-cut').evaluate((el) => getComputedStyle(el).stroke)).toContain('g-area-head')
  expect(await chart.locator('.chart-cut').evaluate((el) => getComputedStyle(el).strokeWidth)).toBe('1.5px')
  // The chip names the moment, and moves with the line.
  const chip = chart.locator('.replay-chip')
  await expect(chip).toHaveText(/^[A-Z][a-z]{2} \d{1,2}/)
  const first = await chip.boundingBox()
  await expect.poll(async () => (await chip.boundingBox())!.x, { timeout: 20_000 }).toBeGreaterThan(first!.x + 20)
  // The dot has its ring and rides the line: on the axis while there are no
  // visitors, up on the line once there are (the last days of the history).
  const dot = chart.locator('.replay-dot circle[r="6"]')
  await expect(dot).toHaveCount(1)
  await expect(chart.locator('.replay-ring')).toHaveCount(1)
  const axis = (await chart.locator('svg').boundingBox())!
  await expect.poll(async () => (await dot.boundingBox())!.y, { timeout: 30_000 }).toBeLessThan(axis.y + axis.height - 60)
  // What has not been played is there, dim (30%), not hidden.
  await expect(chart.locator('svg path[stroke-opacity="0.3"]')).toHaveCount(1)
})

test('with reduced motion the chip names the moment and does not glide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const chart = await playing(page, `/${HISTORY_DOMAIN}?view=data`)
  await expect(chart.locator('.replay-chip')).toHaveText(/^[A-Z][a-z]{2} \d{1,2}/)
  expect(await chart.locator('.replay-chip').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.01)
})

test('before the first visit the key numbers show a dash, then the numbers', async ({ page }) => {
  // A week by the hour on a site whose visits are all recent: it starts empty.
  await playing(page, '/example.com?view=data&period=7d')
  const visitors = page.locator('.kpis .kpi').first().locator('.value')
  await expect(visitors).toHaveText('–')
  expect(await page.locator('.kpis .kpi').first().innerText()).not.toMatch(/%/)
})

// The comparison, set in the period's menu (More): a choice applies at once and
// pressing it again clears it. Clearing takes the line away at once (the address
// says compare=none); a new choice brings it back. By the hour (Now) and by the day.
for (const period of ['now', '7d']) {
  test(`the comparison sets, clears and sets another (${period})`, async ({ page }) => {
    // Now needs a site with a visit today; the history site has only days behind it.
    await page.goto(`${API}/${period === 'now' ? 'example.com' : HISTORY_DOMAIN}?view=data&period=${period}&compare=none`)
    const chart = page.locator('.overview-chart .chart-wrap')
    await expect(chart.locator('svg[role="img"]')).toBeVisible({ timeout: 15_000 })
    const ghost = chart.locator('svg path[stroke-dasharray="4 4"]')
    const picker = page.getByRole('dialog', { name: 'Choose a date range' })
    const compare = picker.getByRole('group', { name: 'Compare' })
    const choose = async (name: string) => {
      await page.locator('.ctl-see .btn.range').click()
      await picker.getByRole('button', { name: 'More' }).click()
      await compare.getByRole('button', { name }).click()
      await page.keyboard.press('Escape')
      await expect(picker).toBeHidden()
    }
    await expect(ghost).toHaveCount(0)
    await expect(page.locator('.cmp-btn')).not.toContainText(/vs|year/i)
    await choose('Period before')
    await expect(ghost).toHaveCount(1)
    expect(page.url()).not.toContain('compare=')
    await page.locator('.cmp-btn').click()
    const menu = page.getByRole('menu', { name: 'Compare with' })
    await expect(menu.getByRole('menuitemradio', { name: 'Period before' })).toHaveAttribute('aria-checked', 'true')
    await menu.getByRole('menuitemradio', { name: 'No comparison' }).click()
    await expect(ghost).toHaveCount(0)
    expect(page.url()).toContain('compare=none')
    await choose('Last year')
    await expect(ghost).toHaveCount(1)
    expect(page.url()).toContain('compare=year')
    await expect(page.locator('.cmp-btn')).toContainText(/year/i)
  })
}
