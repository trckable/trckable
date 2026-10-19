// The period menu's Compare and Group by: a choice goes into the address, stays selected in the menu, and the pill says
// the same words, on Today and on Last 30 days, in the Briefing and in Explore.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the menu')

async function open(page: Page, query: string) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: await session('period-menu'), url: API }])
  await page.addInitScript(() => localStorage.setItem('trckable.onboarding.skipped', '1'))
  await page.goto(`${API}/${HISTORY_DOMAIN}${query}&v=`)
  await expect(page.locator('.hd')).toBeVisible()
}

const surfaces = [
  { name: 'Briefing', extra: '', base: 'per' },
  { name: 'Explore', extra: '&x=overview', base: 'xper' },
]
const periods = [
  { name: 'Today', id: 'today', vs: /vs usual/ },
  { name: 'Last 30 days', id: '30d', vs: /vs the 30 days before/ },
]

for (const s of surfaces) {
  for (const per of periods) {
    test(`${s.name}, ${per.name}: Compare and Group by stick and the pill agrees`, async ({ page }) => {
      await open(page, `?view=briefing&period=${per.id}${s.extra}`)
      // Explore shows its own period chip when it fills the window.
      if (s.base === 'xper') await page.locator('#xpFull').click()
      const pill = page.locator(`#${s.base}Btn`)
      const menu = page.locator(`#${s.base}Menu`)
      const seg = (row: string, text: string) => menu.locator('.mk-lopt', { hasText: row }).locator('.mk-lseg button', { hasText: new RegExp(`^${text}$`) })
      await pill.click()
      // The default says what the pill says: Before is selected while it reads "vs usual" / "vs the 30 days before".
      await expect(pill).toContainText(per.vs)
      await expect(seg('Compare', 'Before')).toHaveClass(/on/)
      await expect(seg('Compare', 'Off')).not.toHaveClass(/on/)
      // Last year needs a year of data, which this site lacks: disabled, and on one line.
      await expect(seg('Compare', 'Last year')).toBeDisabled()
      const box = (await seg('Compare', 'Last year').boundingBox())!
      expect(box.height).toBeLessThan(40)

      await seg('Compare', 'Off').click()
      await expect(page).toHaveURL(/compare=none/)
      await expect(seg('Compare', 'Off')).toHaveClass(/on/)
      await expect(pill).not.toContainText('vs ')
      await seg('Compare', 'Before').click()
      await expect(page).not.toHaveURL(/compare=/)
      await expect(seg('Compare', 'Before')).toHaveClass(/on/)
      await expect(pill).toContainText(per.vs)

      const hourBtn = seg('Group by', 'Hour')
      if (await hourBtn.count()) {
        await hourBtn.click()
        await expect(page).toHaveURL(/bucket=hour/)
        await expect(hourBtn).toHaveClass(/on/)
      }
      await seg('Group by', 'Day').click()
      await expect(page).toHaveURL(/bucket=day/)
      await expect(seg('Group by', 'Day')).toHaveClass(/on/)
      await seg('Group by', 'Auto').click()
      await expect(page).not.toHaveURL(/bucket=/)
      await expect(seg('Group by', 'Auto')).toHaveClass(/on/)
    })
  }
}
