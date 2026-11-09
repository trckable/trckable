// Share: the dialog keeps one size whatever is picked (picture, size, period, section), and the contact sheet of
// the pictures in every size (SHARE_SHOTS=<folder> saves it, with the dialog at 1280 and 390).
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the sheet')

const SHOTS = process.env.SHARE_SHOTS
let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
})

async function open(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
  if (width < 768) {
    await page.locator('.xmore').click()
    await page.getByRole('menuitem', { name: 'Share a picture' }).click()
  } else await page.locator('.share-chip').click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await expect(dialog).toBeVisible()
  return dialog
}

for (const width of [1280, 390]) {
  test(`Share: the dialog never changes size, ${width}px`, async ({ page }) => {
    const dialog = await open(page, width)
    const size = async () => {
      const boxes = await Promise.all(['', '.sd-preview', '.sd-panel'].map(async (s) => (s ? dialog.locator(s) : dialog).boundingBox()))
      return boxes.map((b) => (b ? `${Math.round(b.width)}x${Math.round(b.height)}` : 'none')).join(' ')
    }
    // Open a section unless it already is: a click on an open one closes it.
    const open_ = async (name: RegExp) => {
      const head = dialog.getByRole('button', { name })
      if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
    }
    const gallery = () => open_(/^What to share/)
    await expect(dialog.locator('.sd-preview img.sd-img:not(.is-out, .is-loader)')).toBeVisible()
    const first = await size()
    const same = async (what: string) => expect(await size(), what).toBe(first)

    const pics = dialog.getByRole('radiogroup', { name: 'Card' }).getByRole('radio')
    for (const shape of ['Link', 'Square', 'Story', 'Wide']) {
      await open_(/^Look/)
      await dialog.getByRole('radio', { name: shape }).click()
      await same(`size ${shape}`)
      await gallery()
      for (let i = 0; i < (await pics.count()); i++) {
        if (!(await pics.nth(i).isEnabled()) || (await pics.nth(i).textContent())?.includes('Social post')) continue // a post has no size
        await pics.nth(i).click()
        await same(`picture ${i} at ${shape}`)
      }
    }
    await open_(/^Period/)
    for (const p of ['24 hours', '7 days', '30 days', 'All time']) {
      await dialog.getByRole('button', { name: p, exact: true }).click()
      await same(`period ${p}`)
    }
    await expect(dialog.getByText('Full days, up to yesterday').or(dialog.getByText('The last full 24 hours'))).toBeVisible()
    await open_(/^Look/)
    for (const bg of ['Solid', 'Grid', 'Gradient']) {
      await dialog.getByRole('radio', { name: bg }).click()
      await same(`background ${bg}`)
    }
    // The download says its size.
    await expect(dialog.getByRole('button', { name: /^Download \d+×\d+$/ })).toBeVisible()
  })
}

test('Share: contact sheet of the pictures in every size', async ({ page }) => {
  test.skip(!SHOTS, 'SHARE_SHOTS saves the sheet')
  test.setTimeout(240_000)
  for (const width of [1280, 390]) {
    const dialog = await open(page, width)
    await expect(dialog.locator('.sd-preview img.sd-img:not(.is-out, .is-loader)')).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${SHOTS}/dialog-after-${width}.png` })
    if (width === 390) break
    const base = new URL((await dialog.locator('.sd-preview img.sd-img:not(.is-out, .is-loader)').getAttribute('src')) ?? '', API).pathname
    const pictures = ['overview', 'numbers', 'grid', 'sources', 'topsource', 'leaderboard', 'toppage', 'places', 'topplace', 'devices', 'browsers']
    const rows: [string, string[]][] = []
    for (const [t, theme] of [...pictures.map((p) => [p, 'dark'] as const), ['sources', 'light'], ['topsource', 'light']] as const) {
      const cells: string[] = []
      for (const shape of ['link', 'square', 'story', 'wide']) {
        const r = await page.request.get(`${API}${base}?t=${t}&shape=${shape}&theme=${theme}&period=30d&stats=engaged,avgtime,country`)
        cells.push(`data:image/png;base64,${(await r.body()).toString('base64')}`)
      }
      rows.push([`${t} ${theme}`, cells])
    }
    const html = `<body style="margin:0;padding:16px;background:#222;color:#ddd;font:14px sans-serif">${rows
      .map(([n, c]) => `<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><b style="width:110px">${n}</b>${c.map((u) => `<img src="${u}" style="height:200px">`).join('')}</div>`)
      .join('')}</body>`
    writeFileSync(`${SHOTS}/contact-sheet-2.html`, html)
    const sheet = await page.context().newPage()
    await sheet.setViewportSize({ width: 1500, height: 800 })
    await sheet.setContent(html)
    await sheet.waitForLoadState('load')
    await sheet.screenshot({ path: `${SHOTS}/contact-sheet-2.png`, fullPage: true })
    await sheet.close()
  }
})
