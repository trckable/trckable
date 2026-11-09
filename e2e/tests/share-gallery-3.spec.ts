// Share's report pictures: What changed, Search, AI and mentions, Goals, Sales and Milestone. A picture the site cannot
// make is shown disabled with its reason; the ones it can make are drawn and downloaded at the size asked.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the sheet')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

/** A PNG's width and height, from its header. */
const dims = (b: Buffer) => `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`

test('Share: What changed is picked, drawn and downloaded in two sizes; the others say what they need', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
  await page.locator('.share-chip').click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await expect(dialog).toBeVisible()
  const pics = dialog.getByRole('radiogroup', { name: 'Card' })
  await expect(pics.getByRole('radio', { name: /^What changed/ })).toBeEnabled()
  // Nothing is connected on this site: the rest wait for what they need, and are not drawn.
  await expect(pics.getByRole('radio', { name: /^Google Search/ })).toBeDisabled()
  await expect(pics.getByRole('radio', { name: /^Sales/ })).toBeDisabled()
  await expect(pics.getByRole('radio', { name: /^Top goals/ })).toBeDisabled()
  await expect(pics.getByText('Needs Search Console connected')).toBeVisible()
  await expect(pics.getByRole('radio', { name: /^Overview/ })).toHaveAttribute('aria-checked', 'true')

  await pics.getByRole('radio', { name: /^What changed/ }).click()
  const img = dialog.locator('.sd-preview img.sd-img:not(.is-out, .is-loader)')
  const size = () => img.evaluate((el: HTMLImageElement) => (el.complete ? `${el.naturalWidth}x${el.naturalHeight}` : ''))
  await dialog.getByRole('button', { name: /^Look/ }).click()
  for (const [shape, label, want] of [['link', 'Link', '1200x630'], ['story', 'Story', '1080x1920']] as const) {
    await dialog.getByRole('radio', { name: label }).click()
    await expect.poll(size).toBe(want)
    const file = page.waitForEvent('download')
    await dialog.getByRole('button', { name: /^Download \d+×\d+$/ }).click()
    expect((await file).suggestedFilename()).toBe(`trckable-${STEADY_DOMAIN}-changed${shape === 'link' ? '' : `-${shape}`}-7d.png`)
  }
})

test('Share: Goals, Sales and Milestone are drawn at every size, with a plain line when the site has nothing for them', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const sites = await (await page.request.get(`${API}/api/v1/sites`)).json()
  const id = (sites.sites ?? sites).find((s: { domain: string }) => s.domain === STEADY_DOMAIN).id
  for (const t of ['goals', 'sales', 'milestone']) {
    for (const [shape, want] of [['link', '1200x630'], ['square', '1080x1080'], ['story', '1080x1920'], ['wide', '1600x900']] as const) {
      const r = await page.request.get(`${API}/api/v1/sites/${id}/card?t=${t}&shape=${shape}&period=30d`)
      expect(r.status(), `${t} ${shape}`).toBe(200)
      expect(dims(await r.body()), `${t} ${shape}`).toBe(want)
    }
  }
})
