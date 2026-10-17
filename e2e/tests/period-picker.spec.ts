// The period is one control: the calendar, "Last 30 days", a small tag while a comparison is on, the
// chevron. The comparison's choices are in the same list; nothing else sits beside it.
// Pictures for the review: POLISH_SHOTS=<folder>.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('period-picker'), url: API }])
})

for (const width of [1440, 1280, 800]) {

}


test('the pages with no comparison do not offer one', async ({ page }) => {
  await page.goto(`${API}/${HISTORY_DOMAIN}/links?period=30d`)
  await page.locator('.range-picker .btn.range').click()
  await expect(page.getByRole('dialog', { name: 'Choose a date range' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Compare' })).toHaveCount(0)
})

