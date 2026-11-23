// The share studio keeps one size whatever is picked (place, size, card, period, style), at 1280 and at 390, and the
// picture takes the aspect ratio of the size picked. SHARE_SHOTS=<folder> saves the pictures for the review.
import { mkdirSync } from 'node:fs'
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { openStudio } from './share-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the studio')

const SHOTS = process.env.SHARE_SHOTS
let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
})

for (const width of [1280, 390]) {
  test(`Share studio: the dialog never changes size, ${width}px`, async ({ page }) => {
    const dialog = await openStudio(page, width, cookie)
    const size = async () => {
      const b = await dialog.boundingBox()
      return b ? `${Math.round(b.width)}x${Math.round(b.height)}` : 'none'
    }
    const first = await size()
    const same = async (what: string) => expect(await size(), what).toBe(first)
    const place = (name: string) => dialog.getByRole('button', { name, exact: true })

    // Every place, with each of its own sizes.
    for (const name of ['X', 'LinkedIn']) {
      await place(name).click()
      const sizes = dialog.getByRole('group', { name: 'Size' }).getByRole('button')
      for (let i = 0; i < (await sizes.count()); i++) {
        await sizes.nth(i).click()
        await same(`${name} size ${i}`)
      }
    }
    for (const name of ['Instagram', 'Threads', 'Facebook', 'Bluesky', 'Download', 'Email / embed']) {
      await dialog.locator('.sd-more').click()
      await dialog.locator('.sd-morelist').getByRole('button', { name, exact: true }).click()
      await same(`place ${name}`)
      const sizes = dialog.getByRole('group', { name: 'Size' }).getByRole('button')
      for (let i = 0; i < (await sizes.count()); i++) {
        await sizes.nth(i).click()
        await same(`${name} size ${i}`)
      }
    }
    // Every group of cards, every period and every background.
    const tabs = dialog.getByRole('group', { name: 'Cards' }).getByRole('button')
    for (let i = 0; i < (await tabs.count()); i++) {
      await tabs.nth(i).click()
      await same(`group ${i}`)
    }
    await tabs.first().click()
    for (const p of ['7 days', '30 days', 'All time']) {
      await dialog.getByRole('button', { name: p, exact: true }).click()
      await same(`period ${p}`)
    }
    if (width < 768) await dialog.getByRole('button', { name: 'Style' }).click()
    for (const bg of ['Paper', 'Night grid', 'Glow', 'Sunset', 'Ocean', 'Ink']) {
      await dialog.getByRole('radio', { name: bg }).click()
      await same(`background ${bg}`)
    }
    // Nothing scrolls inside the studio on a wide screen but the strip of cards.
    if (width >= 768) {
      const clipped = await dialog.evaluate((d) => [...d.querySelectorAll<HTMLElement>('.sd-studio, .sd-stage, .sd-side, .sd-shareto')].filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => e.className))
      expect(clipped).toEqual([])
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/studio-${width}.png` })
  })
}
