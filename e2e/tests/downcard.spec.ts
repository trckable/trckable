// The downtime card: its title is the status with the site and the times muted under it, the line is the incident's own day with
// the stretch drawn as a segment of real width, the buttons are one primary and two quiet ones with icons, the tone is an accent on the
// left edge (neutral once the site has been up a while), and the reassurance line is quiet. And a watched line never wraps its status.
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for a layout')

const SHOTS = '/private/tmp/claude-501/-Users-albi-Projects-trckable/ca6f67f6-3760-464f-975f-418264032c74/scratchpad'
let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const NOW = Math.floor(Date.now() / 1000)

async function open(page: Page, width: number, scheme: 'dark' | 'light', agoMin: number) {
  // Ten minutes down, that long ago (the day it falls on is the line).
  const list = [{ id: 'inc-1', site: 'x', kind: 'down', started_at: NOW - (agoMin + 10) * 60, ended_at: NOW - agoMin * 60, cause: 'timeout', expected_visits: 33, note: '' }]
  await page.route('**/api/v1/sites/*/incidents?*', (r) => r.fulfill({ json: new URL(r.request().url()).searchParams.has('from') ? { incidents: list, summary: { count: 1, seconds: 600, lost: 33, lost_some: false } } : { incidents: list, next_before: null } }))
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=30d&v=`)
  await page.evaluate(() => document.fonts.ready)
}

for (const [width, scheme] of [[1280, 'dark'], [1280, 'light'], [390, 'dark']] as const) {
  test(`the downtime card reads as a status with its day, ${width}px ${scheme}`, async ({ page }) => {
    await open(page, width, scheme, 40)
    const card = page.locator('.icard.inc')
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card.locator('.ic-h b')).toHaveText('Down for 10 minutes')
    await expect(card.locator('.ic-site')).toHaveText(STEADY_DOMAIN)
    await expect(card.locator('.ic-when')).toHaveText(/^\d\d:\d\d–\d\d:\d\d$/)
    // The incident's day: the red segment is at least 6px wide and says its minutes and times.
    const seg = card.locator('.obt .obd')
    await expect(seg).toHaveCount(1)
    expect((await seg.boundingBox())!.width).toBeGreaterThanOrEqual(6)
    await expect(seg).toHaveAttribute('title', /^\d\d:\d\d–\d\d:\d\d · Down 10 min$/)
    await expect(card.locator('.obm')).toContainText('Down 10 min')
    await expect(card.locator('.obt .obu')).toHaveText(['Up', 'Up'])
    // The figure of the explanation is heavier than its words.
    await expect(card.locator('.ic-w b')).toHaveText('33 people')
    expect(await card.locator('.ic-w b').evaluate((e) => getComputedStyle(e).fontWeight)).toBe('600')
    // One primary and two quiet buttons with an icon each, one height.
    const buttons = card.locator('.ic-f button')
    await expect(buttons).toHaveText(['Open the incident', 'Watch the site', 'Why?'])
    const heights = await buttons.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    expect(new Set(heights).size).toBe(1)
    await expect(buttons.locator('svg')).toHaveCount(3)
    // The tone is an accent on the card's left edge, not an outline.
    const look = await card.evaluate((e) => ({ shadow: getComputedStyle(e).boxShadow, border: getComputedStyle(e).borderTopColor }))
    expect(look.shadow).not.toBe('none')
    // The reassurance is quiet.
    expect(await card.locator('.ic-calm b').evaluate((e) => getComputedStyle(e).fontWeight)).toBe('400')
    await page.waitForTimeout(300)
    await card.scrollIntoViewIfNeeded()
    await card.screenshot({ path: `${SHOTS}/downcard-${width}-${scheme}.png` })
  })
}

test('once the site has been back up for a while the card is neutral', async ({ page }) => {
  await open(page, 1280, 'dark', 60 * 8)
  const card = page.locator('.icard.inc')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card).toHaveClass(/calm/)
  expect(await card.evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none')
})
