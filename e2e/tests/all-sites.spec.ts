// All sites reads the server and adds it up honestly: the strip's totals are the sum of the rows beside them, the sort orders the rows,
// every state shows in the list's own words, and the ⋯ menu opens a site's settings.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

test('All sites: totals are the rows, sorts, states and the ⋯ menu', async ({ page }) => {
  test.slow()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: await session('all-sites'), url: API }])
  await page.addInitScript(() => localStorage.setItem('trckable.onboarding.skipped', '1'))
  const tag = Date.now()
  const mk = async (name: string) => {
    const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `${name}-${tag}.allsites.example.org` } })
    expect(made.ok()).toBe(true)
    return (await made.json()) as { id: string; domain: string }
  }
  const [busy, small, empty] = [await mk('busy'), await mk('small'), await mk('empty')]
  const visit = async (s: { id: string; domain: string }, n: number) => {
    for (let i = 0; i < n; i++) {
      const sent = await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA + i, 'X-Forwarded-For': `203.0.113.${i + 1}` }, data: { s: s.id, k: 'pv', u: `https://${s.domain}/` } })
      expect(sent.ok()).toBe(true)
    }
  }
  await visit(busy, 3)
  await visit(small, 1)

  // One of them has been quiet for ten hours.
  const last = Math.floor(Date.now() / 1000) - 10 * 3600
  await page.route(/\/api\/v1\/sites(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const res = await route.fetch()
    const body = (await res.json()) as { sites: { id: string }[] }
    await route.fulfill({ response: res, json: { ...body, sites: body.sites.map((s) => (s.id === small.id ? { ...s, last_event_at: last, check: { at: Math.floor(Date.now() / 1000) } } : s)) } })
  })

  await page.goto(`${API}/sites`)
  const row = (s: { id: string }) => page.locator(`.tm-row[data-site="${s.id}"]`)
  const today = (s: { id: string }) => row(s).locator('.c-n b')
  await expect(row(busy)).toBeVisible({ timeout: 30_000 })
  // The visits arrive a moment after they are sent.
  await expect.poll(async () => { await page.reload(); await row(busy).waitFor(); return today(busy).textContent() }, { timeout: 40_000 }).toBe('3')

  // The strip is the rows: Today and Online add up what the rows show.
  const nums = async (sel: string) => (await page.locator(sel).allTextContents()).map((t) => Number(t.replace(/\D/g, '')) || 0)
  const sum = (a: number[]) => a.reduce((n, v) => n + v, 0)
  const rowsToday = sum(await nums('.tm-row[data-site] .c-n b'))
  expect(Number((await page.locator('[data-k=today]').textContent())!.replace(/\D/g, ''))).toBe(rowsToday)
  const rowsNow = sum(await nums('.tm-row[data-site] .tm-live'))
  expect(Number((await page.locator('[data-k=online]').textContent())!.replace(/\D/g, ''))).toBe(rowsNow)

  // States, in the list's words: quiet, not verified, receiving.
  await expect(row(small)).toContainText('quiet 10h')
  await expect(row(empty)).toContainText('Not verified')
  await expect(row(busy)).toContainText('Receiving')
  expect(await page.locator('[data-k=attention]').textContent()).toMatch(/^[1-9]/)
  await expect(page.locator('[data-k=briefing]')).toContainText('need')

  // Attention puts the sites that need a look first; Traffic orders by today.
  const order = async () => page.locator('.tm-row[data-site]').evaluateAll((els) => els.map((e) => e.getAttribute('data-site')))
  let ids = await order()
  expect(ids.indexOf(empty.id)).toBeLessThan(ids.indexOf(busy.id))
  expect(ids.indexOf(small.id)).toBeLessThan(ids.indexOf(busy.id))
  await page.getByRole('radio', { name: 'Traffic' }).click()
  const traffic = await nums('.tm-row[data-site] .c-n b')
  expect(traffic).toEqual([...traffic].sort((a, b) => b - a))
  ids = await order()
  expect(ids.indexOf(busy.id)).toBeLessThan(ids.indexOf(empty.id))

  // A site not installed yet opens its install card, which leads back to Sites.
  await row(empty).getByRole('button', { name: empty.domain }).click()
  const back = page.getByRole('link', { name: '← Sites' })
  await expect(back).toBeVisible({ timeout: 20_000 })
  await back.click()
  await expect(page).toHaveURL(/\/sites$/)
  await row(busy).waitFor()

  // The ⋯ menu opens the site's settings over its dashboard.
  await row(busy).getByRole('button', { name: /^More for / }).click()
  await page.getByRole('menuitem', { name: 'Site settings' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20_000 })
  await expect(page).toHaveURL(new RegExp(`/${busy.domain.replace(/\./g, '\\.')}`))

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  for (const s of [busy, small, empty]) await page.request.delete(`${API}/api/v1/sites/${s.id}`, { headers: H, data: { domain: s.domain } })
})
