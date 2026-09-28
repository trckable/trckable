// The site icon cropper: a wide logo can be moved, zoomed out until it fits
// whole, centred again, and what is saved is what the frame showed.
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'icon crop e2e password 1'

// Sign-ins are rate limited per address: every worker shares one session.
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'icon-crop-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `icon-crop-${Date.now()}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 5) throw e
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

// A 400 × 100 opaque red logo, four times wider than tall.
async function wideLogo(page: Page): Promise<Buffer> {
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 400
    c.height = 100
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#e11'
    ctx.fillRect(0, 0, 400, 100)
    return c.toDataURL('image/png')
  })
  return Buffer.from(url.split(',')[1], 'base64')
}

const offset = (page: Page) =>
  page.locator('.crop-stage img').evaluate((el) => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec((el as HTMLElement).style.transform)
    return { x: Number(m?.[1]), y: Number(m?.[2]), w: parseFloat((el as HTMLElement).style.width), h: parseFloat((el as HTMLElement).style.height) }
  })

test('a wide logo is dragged, zoomed out to fit, centred and saved', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(API + '/example.com')
  const site = await page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites.find((s: { domain: string }) => s.domain === 'example.com').id)
  await page.goto(`${API}/settings?site=${site}&tab=site`)
  await page.locator('input[type=file][accept*="image/png"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await wideLogo(page) })

  const stage = page.locator('.crop-stage')
  await expect(stage.locator('img')).toBeVisible()
  // The lowest zoom shows all of it: 240 wide, 60 tall, centred.
  const zoom = page.getByRole('slider', { name: 'Zoom' })
  await expect(zoom).toHaveValue('1')
  expect(await offset(page)).toEqual({ x: 0, y: 90, w: 240, h: 60 })

  // Zoom in with the keys, then drag with the mouse.
  await stage.focus()
  for (let i = 0; i < 8; i++) await page.keyboard.press('+')
  const box = (await stage.boundingBox())!
  await page.mouse.move(box.x + 120, box.y + 120)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, box.y + 400, { steps: 5 })
  await page.mouse.up()
  const dragged = await offset(page)
  // Moved right and down, but still inside the frame.
  expect(dragged.x).toBeGreaterThan(-(dragged.w - 240) / 2)
  expect(dragged.y + dragged.h).toBeLessThanOrEqual(240 + 0.01)
  expect(dragged.y).toBeGreaterThan((240 - dragged.h) / 2)

  // An arrow key moves it too.
  await stage.focus()
  await page.keyboard.press('ArrowLeft')
  expect((await offset(page)).x).toBeCloseTo(dragged.x - 10, 1)

  // Back to the lowest zoom, then centred: the whole logo, in the middle.
  await zoom.fill('1')
  await page.getByRole('button', { name: 'Center' }).click()
  expect(await offset(page)).toEqual({ x: 0, y: 90, w: 240, h: 60 })

  await page.getByRole('button', { name: 'Save picture' }).click()
  await expect(page.locator('.crop-modal')).toHaveCount(0, { timeout: 10_000 })

  // The saved icon is the frame: a band across the middle, clear above and below.
  const px = await page.evaluate(async (id) => {
    const blob = await (await fetch(`/api/v1/sites/${id}/icon`)).blob()
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data]
    return { size: [bmp.width, bmp.height], top: at(128, 20), middle: at(128, 128), left: at(4, 128) }
  }, site)
  expect(px.size).toEqual([256, 256])
  expect(px.top[3]).toBe(0)
  expect(px.middle[3]).toBe(255)
  expect(px.middle[0]).toBeGreaterThan(200)
  expect(px.left[3]).toBe(255)
})
