// Filters say "is not" and "any of", and two or more of them can be kept as a
// segment: in the address, in the chips, in the API and in a saved view, in the
// same words. The history site has visitors 1 to 4 days ago, each entering on
// "/" or "/pricing".
import { expect, test, type Page } from '@playwright/test'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: await session('segments'), url: API }])
})

const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
const base = `/${HISTORY_DOMAIN}?view=data&period=custom&from=${day(4)}&to=${day(1)}`

// The tile's own name carries the number, whatever its count-up is showing.
const visitors = async (page: Page) => Number(/\d[\d,]*/.exec((await page.getByRole('button', { name: /^Visitors \d/ }).getAttribute('aria-label')) ?? (await page.getByRole('button', { name: /^Visitors \d/ }).innerText()))?.[0].replace(/\D/g, ''))
const chip = (page: Page) => page.locator('.toolbar-filters .chip:not(.more)')

async function pick(page: Page, dim: string, value: RegExp) {
  // The list stays open after a pick: somebody narrowing is often about to narrow again.
  const list = page.getByRole('menu', { name: 'Search filters' })
  if (!(await list.isVisible())) await page.getByRole('button', { name: /^Filter/ }).click()
  await list.getByRole('menuitem', { name: new RegExp('^' + dim) }).click()
  await list.getByRole('menuitem', { name: value }).click()
}

test('is not, any of and a saved segment say the same thing everywhere', async ({ page }) => {
  await page.goto(API + base)
  await expect(page.locator('.kpi .value.num').first()).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => visitors(page)).toBeGreaterThan(2)
  const all = await visitors(page)

  // One value, then a second of the same dimension: any of.
  await pick(page, 'Entry page', /^\/pricing/)
  await expect(chip(page)).toHaveCount(1)
  await expect(chip(page).locator('b')).toHaveText('/pricing')
  await expect.poll(() => visitors(page)).toBeLessThan(all)
  const pricing = await visitors(page)
  await pick(page, 'Entry page', /^\/ /)
  await expect(chip(page)).toHaveCount(1)
  await expect(chip(page).locator('b')).toHaveText('/pricing or /')
  await expect.poll(() => visitors(page)).toBe(all)
  await expect(page).toHaveURL(/f=entry_page%3A%2Fpricing&f=entry_page%3A%2F(&|$)/)

  // The chip's "is" is a switch.
  await page.getByRole('button', { name: 'Entry page is: change to is not' }).click()
  await expect(page.getByRole('button', { name: 'Entry page is not: change to is' })).toBeVisible()
  await expect(page).toHaveURL(/f=entry_page%21%3A%2Fpricing&f=entry_page%21%3A%2F(&|$)/)

  // Back to one value, "is not": the visitors that did not enter on /pricing.
  await page.goto(API + base + '&f=entry_page%21%3A%2Fpricing')
  await expect(chip(page).locator('b')).toHaveText('/pricing')
  await expect(page.getByRole('button', { name: 'Entry page is not: change to is' })).toBeVisible()
  await expect.poll(() => visitors(page)).toBe(all - pricing)

  // A second filter: the offer to keep them.
  await expect(page.getByRole('button', { name: 'Save as segment?' })).toHaveCount(0)
  await pick(page, 'Channel', /^Direct/)
  await expect(chip(page)).toHaveCount(2)
  await page.getByRole('button', { name: 'Save as segment?' }).click()
  await page.getByLabel('Name').fill('Not pricing, direct')
  await page.getByRole('button', { name: 'Save view' }).click()
  await expect(page.getByRole('button', { name: /^Not pricing, direct/ })).toBeVisible()

  // The API takes the same words: the filter in the address, and the segment by its id.
  const site = (await (await page.request.get(API + '/api/v1/sites')).json()).sites.find((s: { domain: string }) => s.domain === HISTORY_DOMAIN) as { id: string }
  const count = async (qs: string) => ((await (await page.request.get(`${API}/api/v1/sites/${site.id}/report?from=${day(4)}&to=${day(1)}&${qs}`)).json()) as { current: { kpis: { visitors: number } } }).current.kpis.visitors
  expect(await count('f=entry_page!:/pricing')).toBe(all - pricing)
  expect(await count('f=entry_page:/&f=entry_page:/pricing')).toBe(all)
  const saved = (await (await page.request.get(`${API}/api/v1/sites/${site.id}/segments`)).json()) as { segments: { id: string; name: string; query: string }[] }
  const seg = saved.segments.find((s) => s.name === 'Not pricing, direct')!
  expect(decodeURIComponent(seg.query)).toContain('f=entry_page!:/pricing')
  expect(await count('segment=' + seg.id)).toBe(all - pricing)
})
