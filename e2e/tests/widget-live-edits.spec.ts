// A widget is pasted onto a customer's page once. Whatever Settings changes
// after that (theme, mode, corner, words) shows on the next visit, with
// nothing pasted again: the browser keeps both files but asks the server on
// every load. A site of its own, so no other suite's counts move.
import { expect, test } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('widget-live-edits')
})

test('a theme, mode, corner and words changed in Settings reach pages that already carry the code', async ({ page, context }) => {
  test.setTimeout(100_000)
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: the server and the cache headers do the work')
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `live-${Date.now()}.example.org` } })
  expect(made.ok()).toBe(true)
  const site = ((await made.json()) as { id: string }).id
  const base = { kind: 'online', theme: 'dark', accent: '', radius: 16, lang: 'en', texts: {}, on: true }
  const w = await page.request.post(`${API}/api/v1/sites/${site}/widgets`, { headers: H, data: { ...base, shows: ['right'] } })
  expect(w.ok()).toBe(true)
  const id = ((await w.json()) as { id: string }).id
  const edit = async (patch: object) => expect((await page.request.put(`${API}/api/v1/sites/${site}/widgets/${id}`, { headers: H, data: { ...base, ...patch } })).ok()).toBe(true)

  const corner = page.locator('iframe[title="People online"]')
  const cornerFrame = page.frameLocator('iframe[title="People online"]')
  await page.goto(`http://127.0.0.1:18301/online/${id}`)
  await expect(cornerFrame.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(cornerFrame.locator('.pill')).toHaveCount(1)
  let box = (await corner.boundingBox())!
  expect(box.width).toBe(180)
  expect(box.x).toBeGreaterThan(page.viewportSize()!.width / 2)

  // The plain frame, on its own customer page.
  const plain = await context.newPage()
  const plainFrame = plain.frameLocator('iframe[title="Widget"]')
  await plain.goto(`http://127.0.0.1:18301/frame/${id}`)
  await expect(plainFrame.locator('html')).toHaveAttribute('data-theme', 'dark')

  // One edit, then the pages are opened again as a returning visitor opens them
  // (the same browser, the same cache): everything is the new look.
  await edit({ theme: 'light', accent: '#fb923c', radius: 4, texts: { online: 'here now' }, shows: ['card', 'pages', 'left'] })
  await page.goto(`http://127.0.0.1:18301/online/${id}`)
  await expect(cornerFrame.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(cornerFrame.locator('.pill')).toHaveCount(0)
  await expect(cornerFrame.getByText('Online now')).toBeVisible()
  box = (await corner.boundingBox())!
  expect(box.width).toBe(280)
  expect(box.x).toBeLessThan(40)
  await plain.goto(`http://127.0.0.1:18301/frame/${id}`)
  await expect(plainFrame.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(plainFrame.getByText('Online now')).toBeVisible()
  expect(await plainFrame.locator('.card').evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('4px')

  // And back: dark, a pill, the right-hand corner.
  await edit({ theme: 'dark', shows: ['right'] })
  await page.goto(`http://127.0.0.1:18301/online/${id}`)
  await expect(cornerFrame.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(cornerFrame.locator('.pill')).toHaveCount(1)
  box = (await corner.boundingBox())!
  expect(box.width).toBe(180)
  expect(box.x).toBeGreaterThan(page.viewportSize()!.width / 2)

  // The files are kept but asked about on every load: nothing waits out a timer.
  for (const path of [`/w/${id}`, `/js/${id}.online.js`]) {
    const r = await page.request.get(`${API}${path}`)
    expect(r.headers()['cache-control']).toContain('no-cache')
    expect(r.headers()['etag']).toBeTruthy()
    expect((await page.request.get(`${API}${path}`, { headers: { 'If-None-Match': r.headers()['etag'] } })).status()).toBe(304)
  }
})
