// Pictures for the review of share-flow (not part of the suite): SHOTS=<folder> W=<width> SCHEME=dark|light
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { H, newSite, visit, openSettings } from './audit-kit'
import { session } from './session'

const SHOTS = process.env.SHOTS
const W = Number(process.env.W || 1440)
const SCHEME = process.env.SCHEME === 'light' ? 'light' : 'dark'
test.skip(!SHOTS, 'only with SHOTS')
test.skip(({ browserName }) => browserName !== 'chromium', 'one browser')
test.use({ colorScheme: SCHEME, viewport: { width: W, height: W < 500 ? 900 : 1000 } })

test('share-flow shots', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('shots-share-flow'), url: API }])
  const site = await newSite(page, 'shotsflow')
  for (let i = 0; i < 6; i++) await visit(page.request, site, i % 2 ? '/pricing' : '/home', { referrer: i % 3 ? 'https://news.example/' : 'https://search.example/' })
  const make = async (data: object) => ((await (await page.request.post(`${API}/api/v1/sites/${site.id}/shares`, { headers: H, data })).json()) as { url: string }).url
  await make({ name: 'For the investors', sections: ['pages', 'sources'], period: '30d', notes: true })
  await make({ name: 'Board', password: 'a long enough phrase', days: 30 })
  const tag = `${SCHEME}-${W}`

  // The dialog and its Links panel with the real preview.
  if (W < 500) {
    await page.goto(`${API}/${site.domain}?view=explore&period=7d`)
    await page.locator('.xmore').click()
    await page.locator('#xm-more [role=menuitem]').first().click()
  } else {
    await page.goto(`${API}/${site.domain}?view=briefing`)
    await page.locator('.share-chip').click()
  }
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(800)
  await dialog.screenshot({ path: `${SHOTS}/dialog-${tag}.png` })
  await dialog.getByRole('radio', { name: 'Text post' }).click()
  await page.waitForTimeout(600)
  await dialog.screenshot({ path: `${SHOTS}/dialog-post-${tag}.png` })
  await dialog.getByRole('radio', { name: 'Picture' }).click()
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect(dialog.getByRole('menu')).toBeVisible()
  await dialog.screenshot({ path: `${SHOTS}/dialog-copy-link-picker-${tag}.png` })
  await dialog.getByRole('button', { name: 'Links', exact: true }).click()
  await dialog.getByRole('button', { name: 'More', exact: true }).click()
  await dialog.getByRole('group', { name: 'Sections' }).getByRole('button', { name: 'Tech' }).click()
  await dialog.getByLabel('Period').selectOption('7d')
  await expect(dialog.frameLocator('iframe.sl-live-page').locator('.hd')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await dialog.screenshot({ path: `${SHOTS}/dialog-links-builder-${tag}.png` })

  // Settings → Sharing: the builder with its preview, and a link opened for changes.
  await openSettings(page, site, 'sharing')
  const card = page.locator('#shares')
  await card.getByRole('button', { name: 'New link' }).first().click()
  await card.getByRole('group', { name: 'Sections' }).getByRole('button', { name: 'Places' }).click()
  await card.locator('select[aria-label="Period"]').selectOption('30d')
  await expect(card.frameLocator('iframe.sl-live-page').locator('.hd')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/settings-builder-${tag}.png` })
  await card.getByRole('button', { name: 'Cancel' }).click()
  await card.locator('.sl-row').first().getByRole('button', { name: /^Edit link/ }).click()
  await expect(card.locator('.sl-edit')).toBeVisible()
  await card.locator('.sl-edit').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/settings-edit-row-${tag}.png` })
})
