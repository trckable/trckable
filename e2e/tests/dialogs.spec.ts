// The one dialog pattern, against a trckabled with the demo data (skipped
// unless TRCKABLE_A11Y_URL points at one, like control-row):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test dialogs
// A head of a title and one short line; choices as one radio group of equal
// cards; labelled fields with their error under them; one primary button per
// step; focus in, trapped, and back on close; a bottom sheet on a phone. And
// Compact's quiet way into Full, now that its card at the bottom is gone.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from './fixtures'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')
test.describe.configure({ mode: 'serial' })

async function session(): Promise<string> {
  const file = join(tmpdir(), `trckable-dialogs-${new URL(BASE!).port}-${process.ppid}`)
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const res = await fetch(BASE + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: BASE! }])
  await page.goto(BASE + '/')
  const domain = await page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites[0].domain as string)
  await page.goto(`${BASE}/${domain}?view=data`)
  await expect(page.locator('.overview-chart .chart-wrap svg')).toBeVisible({ timeout: 20_000 })
}

const goalButton = (page: Page) => page.getByRole('button', { name: '+ Track a goal' })

test('Track a goal: a short head, four equal cards as one radio group, one primary', async ({ page }) => {
  await open(page, 1280)
  await goalButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Add goals' })
  await expect(dialog).toBeVisible()
  // The head is a title and one short line, no paragraphs.
  await expect(dialog.getByRole('heading', { name: 'Track a goal' })).toBeVisible()
  const hint = dialog.locator('.dlg-head .faint')
  expect((await hint.textContent())!.length).toBeLessThanOrEqual(70)

  const group = dialog.getByRole('radiogroup', { name: 'How to count it' })
  const radios = group.getByRole('radio')
  await expect(radios).toHaveCount(4)
  await expect(radios.first()).toBeChecked()
  const boxes = await radios.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) })))
  expect(new Set(boxes.map((b) => b.w)).size, 'one width').toBe(1)
  expect(new Set(boxes.map((b) => b.h)).size, 'one height').toBe(1)
  expect(new Set(boxes.map((b) => b.x)).size, 'two columns').toBe(2)
  // Only the chosen card is in the tab order; the arrow keys move the choice.
  await expect(radios.nth(1)).toHaveAttribute('tabindex', '-1')
  await radios.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(radios.nth(1)).toBeChecked()
  await expect(radios.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(radios.first()).toBeChecked()

  // Exactly one primary button, and it is the one that adds.
  await expect(dialog.locator('.btn.primary')).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: 'Add goal' })).toBeVisible()
  const axe = await new AxeBuilder({ page }).include('[role=dialog]').analyze()
  expect(axe.violations.map((v) => v.id + ' ' + v.nodes.length)).toEqual([])
})

test('Track a goal: a code route has Done as its one primary', async ({ page }) => {
  await open(page, 1280)
  await goalButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Add goals' })
  await dialog.getByRole('radio', { name: /Button or link/ }).click()
  await expect(dialog.locator('.btn.primary')).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: 'Done' })).toHaveClass(/primary/)
})

test('Track a goal: labelled fields, an error under the field, the goal as a row with a check', async ({ page }) => {
  await open(page, 1280)
  await goalButton(page).click()
  const dialog = page.getByRole('dialog', { name: 'Add goals' })
  const name = dialog.getByLabel('Goal name')
  const path = dialog.getByLabel('Page', { exact: true })
  await expect(name).toBeVisible()
  await expect(path).toBeVisible()
  const tag = `polish${Date.now() % 100000}`
  await name.fill(tag)
  await path.fill('/pricing')
  await dialog.getByRole('button', { name: 'Add goal' }).click()
  const list = dialog.getByRole('list', { name: 'Page goals' })
  const row = list.getByRole('listitem').filter({ hasText: tag })
  await expect(row).toBeVisible()
  await expect(row.locator('svg').first()).toBeVisible()
  // The row sits above the form.
  expect((await row.boundingBox())!.y).toBeLessThan((await name.boundingBox())!.y)
  // The same name again: the error is under the Goal name field.
  await name.fill(tag)
  await path.fill('/docs')
  await dialog.getByRole('button', { name: 'Add goal' }).click()
  const err = dialog.getByRole('alert').filter({ hasText: 'already a goal' })
  await expect(err).toBeVisible()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  expect((await err.boundingBox())!.y).toBeGreaterThan((await name.boundingBox())!.y)
  // Clean up: the demo keeps no goal from this run.
  await row.getByRole('button', { name: `Remove the goal ${tag}` }).click()
  await expect(row).toHaveCount(0)
})

test('a dialog takes focus, keeps Tab inside, closes on Escape and gives focus back', async ({ page }) => {
  await open(page, 1280)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menu', { name: 'More' }).getByRole('menuitem', { name: /Create/ }).click()
  await page.getByRole('menu', { name: 'Create something' }).getByRole('menuitem', { name: /Note/ }).click()
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.btn.primary')).toHaveCount(1)
  await expect(page.locator('body')).not.toBeFocused()
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), 'Tab stays in the dialog').toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeFocused()
})

test('every dialog fades and scales for 160 ms, and leaves a copy nobody can reach', async ({ page }) => {
  await open(page, 1280)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await goalButton(page).click()
  const back = page.locator('.modal-back').first()
  const timing = await back.evaluate((el) => getComputedStyle(el).animationDuration)
  expect(timing).toBe('0.16s')
  await page.keyboard.press('Escape')
  const ghost = page.locator('.modal-back.leaving')
  await expect(ghost).toHaveAttribute('aria-hidden', 'true')
  await expect(ghost.getByRole('dialog')).toHaveCount(0)
  await expect(ghost).toHaveCount(0, { timeout: 2000 })
})

test('on a phone a dialog is a bottom sheet with one column of cards', async ({ page }) => {
  await open(page, 390)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menu', { name: 'More' }).getByRole('menuitem', { name: /Create/ }).click()
  await page.getByRole('menu', { name: 'Create something' }).getByRole('menuitem', { name: /Goal/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Add goals' })
  await expect(dialog).toBeVisible()
  const r = (await dialog.boundingBox())!
  expect(Math.round(r.width), 'the full width').toBe(390)
  expect(Math.round(r.y + r.height), 'at the bottom edge').toBe(900)
  const xs = await dialog.getByRole('radio').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)))
  expect(new Set(xs).size, 'one column').toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})

test('Compact has a quiet Full button, not a card, and it opens Full', async ({ page }) => {
  await open(page, 1280)
  await expect(page.getByText("That's the whole story on one screen")).toHaveCount(0)
  const full = page.getByRole('button', { name: 'Show the Full view' })
  await expect(full).toBeVisible()
  // In the first card's tab row, at its right end.
  const card = (await page.locator('[data-card=who]').boundingBox())!
  const b = (await full.boundingBox())!
  expect(b.x + b.width).toBeGreaterThan(card.x + card.width - 40)
  expect(b.y).toBeLessThan(card.y + 60)
  await full.click()
  await expect(page).toHaveURL(/mode=full/)
  await expect(page.getByRole('button', { name: 'Show the Full view' })).toHaveCount(0)
})
