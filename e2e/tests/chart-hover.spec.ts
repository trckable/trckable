// The main chart plays back under the cursor: everything right of it greys
// out, the left stays lit, the crosshair sits at the cut. Arrow keys and
// Replay move the same cut, leaving the chart restores it, a note stays
// readable in the hover card, and with reduced motion the cut never glides.
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'chart hover e2e password 1'

// Signing in is rate limited per address: every browser here shares one
// session, made once by whichever worker gets there first.
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'chart-hover-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `chart-hover-${Date.now()}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 4) throw e
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

let cookie = ''
test.beforeAll(async ({ browser }) => {
  cookie = await session()
  // At least one visit today, so the chart has a line to cut.
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/chart-hover-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

async function openChart(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + '/example.com?compare=previous')
  const chart = page.locator('.chart-wrap')
  await expect(chart.locator('svg[role="img"]')).toBeVisible({ timeout: 15_000 })
  return chart
}

const cut = (page: Page) =>
  page.locator('.chart-wrap').evaluate((el: HTMLElement) => ({
    state: el.dataset.cut,
    at: parseFloat(el.style.getPropertyValue('--cut')),
    width: el.getBoundingClientRect().width,
  }))

test('the cut follows the pointer and leaving the chart restores it', async ({ page }) => {
  const chart = await openChart(page)
  const box = (await chart.boundingBox())!
  expect((await cut(page)).state).toBe('off')

  await page.mouse.move(box.x + box.width * 0.4, box.y + 60)
  await expect(page.locator('.time-tip')).toBeVisible()
  let c = await cut(page)
  expect(c.state).toBe('on')
  expect(c.at).toBeGreaterThan(c.width * 0.3)
  expect(c.at).toBeLessThan(c.width * 0.5)
  // The line, area, ghost and strip are one masked group: the paths do not
  // change as the cut moves, only the mask's grey rect does.
  const d = await chart.locator('.chart-line').getAttribute('d')
  await page.mouse.move(box.x + box.width * 0.6, box.y + 60)
  c = await cut(page)
  expect(c.at).toBeGreaterThan(c.width * 0.5)
  await expect(chart.locator('.chart-line')).toHaveAttribute('d', d!)
  expect(await chart.locator('g[mask] .chart-line').count()).toBe(1)

  await page.mouse.move(box.x + box.width / 2, box.y - 120)
  await expect(page.locator('.time-tip')).toHaveCount(0)
  expect((await cut(page)).state).toBe('off')
})

test('arrow keys move the same cut, a bucket at a time', async ({ page }) => {
  const chart = await openChart(page)
  await chart.locator('svg[role="img"]').focus()
  await page.keyboard.press('End')
  const end = (await cut(page)).at
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.time-tip')).toBeVisible()
  const back = await cut(page)
  expect(back.state).toBe('on')
  expect(back.at).toBeLessThan(end)
  await page.keyboard.press('Escape')
  expect((await cut(page)).state).toBe('off')
})

test('a note stays readable and is added from the crosshair', async ({ page }) => {
  const chart = await openChart(page)
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + 80)
  // The day it goes on, as the + says it ("Add a note on Sat, Sep 26").
  const day = ((await page.locator('.note-add').getAttribute('aria-label')) ?? '').replace(/^Add a note on /, '').replace(/ · \d\d:\d\d$/, '')
  await page.locator('.note-add').click()
  const text = `Chart hover note ${Date.now()}`
  await page.getByPlaceholder(/What happened/).fill(text)
  await page.getByRole('dialog').getByRole('button', { name: 'Add note' }).click()
  // Flags sit above the chart's mask, so the greyed half never dims them.
  const flag = chart.locator('.note-mark').first()
  await expect(flag).toBeVisible()
  expect(await flag.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  // Back on the note's day: its flag (by the hour, a day's note sits on the
  // day's first hour).
  const at = (await chart.getByRole('button', { name: new RegExp(`notes? on ${day}$`) }).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y - 120)
  await page.mouse.move(at.x + at.width / 2, box.y + 80)
  // Every browser adds its own note to the same day: find this one's.
  await expect(page.locator('.time-tip .tip-note', { hasText: text })).toBeVisible()
})

test('with reduced motion the cut moves without a glide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const chart = await openChart(page)
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + 60)
  // Reduced motion leaves at most the page-wide near-zero duration.
  const glide = await page.locator('.chart-dim').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))
  expect(glide).toBeLessThan(0.01)
  expect((await cut(page)).state).toBe('on')
})

// A new site's week is drawn by the hour from its first visit: Replay plays
// that chart, hour by hour, and never swaps it for the week by day.
test('Replay plays the chart on screen: same start, same bucket', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + '/example.com?period=7d')
  const svg = page.locator('.overview-chart .chart-wrap svg[role="img"]')
  await expect(svg).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.overview-chart .since-chip')).toBeVisible()
  const before = await svg.getAttribute('aria-label')
  await page.getByRole('button', { name: 'Replay this period hour by hour' }).click()
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await expect(page.locator('.overview-chart.replaying')).toBeVisible()
  await expect(svg).toHaveAttribute('aria-label', before!)
  expect(page.url()).not.toMatch(/[?&](day|bucket)=/)
  // The story: its moments' rail under the chart; Esc stops it.
  await expect(page.locator('.overview-chart .story')).toBeVisible()
  await page.getByRole('button', { name: 'Pause replay' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.overview-chart .story')).toHaveCount(0)
})
