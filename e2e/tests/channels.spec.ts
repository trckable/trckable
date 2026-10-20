// Channels on All sites: connect (the platform's side is faked), the cards, and disconnecting, which deletes the numbers. The server's
// answers are faked through the route, as the Mentions specs do; what the server really deletes is held by its own tests.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const account = { id: 'a1', platform: 'youtube', handle: '@makerstudio', created_at: 1, last_ok_at: 2 }
const youtube = (connected: boolean) => ({
  platform: 'youtube',
  ready: true,
  accounts: connected ? [account] : [],
  monitoring: connected ? 1 : 0,
  ...(connected ? { views: 4210, previous: 3500, series: [{ day: day(3), views: 1200 }, { day: day(2), views: 1500 }, { day: day(1), views: 1510 }] } : {}),
  series: connected ? [{ day: day(3), views: 1200 }, { day: day(2), views: 1500 }, { day: day(1), views: 1510 }] : [],
})
const off = { platform: 'instagram', ready: false, accounts: [], monitoring: 0, series: [] }
const threads = { platform: 'threads', ready: true, accounts: [], monitoring: 0, series: [] }

test('connect, see the card, and disconnect deletes it', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('channels'), url: API }])
  await page.addInitScript(() => localStorage.setItem('trckable.onboarding.skipped', '1'))
  let connected = false
  let disconnects = 0
  await page.route('**/api/v1/channels?*', (r) => r.fulfill({ json: { days: 30, through: day(1), platforms: [youtube(connected), off, threads] } }))
  await page.route('**/api/v1/channels/accounts/a1', (r) => {
    disconnects++
    connected = false
    return r.fulfill({ status: 204 })
  })
  // The sign-in: the server's start address sends the browser to the platform, which sends it back; here both are one hop.
  await page.route('**/api/v1/channels/youtube/start', (r) => {
    connected = true
    return r.fulfill({ status: 303, headers: { location: '/sites?channel=youtube&connected=1' } })
  })

  await page.goto(`${API}/sites`)
  const sec = page.locator('.ch-sec')
  await expect(sec.getByRole('heading', { name: 'Channels' })).toBeVisible({ timeout: 30_000 })
  // Nothing connected: the ones with keys offer Connect, the one without is disabled and says how to set it up.
  await expect(sec.getByRole('link', { name: 'Connect YouTube' })).toBeVisible()
  await expect(sec.getByRole('button', { name: 'Connect Instagram' })).toBeDisabled()
  await expect(sec.getByRole('link', { name: 'How to set it up' })).toBeVisible()

  await sec.getByRole('link', { name: 'Connect YouTube' }).click()
  const card = sec.locator('.ch-card[data-p="youtube"]')
  await expect(card).toContainText('4,210', { timeout: 20_000 })
  await expect(card).toContainText('Monitoring 1 account')
  await expect(card).toContainText('@makerstudio')
  // Views by platform in the header; no total across them.
  await expect(sec.locator('[data-k="channel-accounts"]')).toContainText('1')
  await expect(page).not.toHaveURL(/channel=/)

  await card.getByRole('button', { name: 'More for YouTube' }).click()
  await page.getByRole('menuitem', { name: 'Disconnect @makerstudio' }).click()
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect(sec.locator('.ch-card')).toHaveCount(0, { timeout: 20_000 })
  expect(disconnects).toBe(1)
  await expect(sec.getByRole('link', { name: 'Connect YouTube' })).toBeVisible()
})
