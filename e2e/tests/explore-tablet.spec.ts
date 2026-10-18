// Explore at full width on a tablet (a folding phone's inner screen): the cards at the top of each section keep room for their words and numbers.
// Chromium only.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the panel')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'explore e2e password 1'

// One session for every test of the file, made by whichever worker gets there first (signing in is rate limited).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'explore-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `explore-${Date.now()}@example.com`
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
test.beforeAll(async () => {
  cookie = await session()
})

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  // An empty v is the address with no view: the suite would otherwise send it to Explore, which opens the panel.
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
  await expect(page.locator('.brief')).toBeVisible()
}


async function squeezed(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'
    document.body.appendChild(probe)
    for (const card of document.querySelectorAll<HTMLElement>('#xp .kc')) {
      if (card.scrollWidth > card.clientWidth + 1) out.push(`card overflows: ${card.textContent}`)
      for (const v of card.querySelectorAll<HTMLElement>('.kv')) if (v.scrollWidth > v.clientWidth + 1) out.push(`number clipped: ${v.textContent}`)
      for (const l of card.querySelectorAll<HTMLElement>('.kl')) {
        const style = getComputedStyle(l)
        probe.style.font = style.font
        const longest = Math.max(0, ...(l.textContent ?? '').split(/\s+/).map((w) => ((probe.textContent = w), probe.getBoundingClientRect().width)))
        if (l.clientWidth + 1 < longest) out.push(`label narrower than its longest word: ${l.textContent}`)
      }
    }
    probe.remove()
    return out
  })
}

for (const [width, height] of [
  [820, 1000],
  [900, 1100],
]) {
  test(`full width at ${width} px: the cards at the top of every section have room for their words and numbers`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=`)
    await expect(page.locator('.brief')).toBeVisible()
    await page.keyboard.press('e')
    await expect(page.locator('#xp.on .xtb')).toBeVisible()
    await page.keyboard.press('f')
    const items = page.locator('#xp.full .xrail .xri')
    await expect(items).toHaveCount(11)
    for (let i = 0; i < 11; i++) {
      await items.nth(i).click()
      await expect(page.locator('#xp .xrail .xri').nth(i)).toBeVisible()
      expect(await squeezed(page), `section ${i}`).toEqual([])
    }
    const overview = page.locator('#xp .xrail .xri').first()
    await overview.click()
    const cards = page.locator('#xp .kcs .kc')
    await expect(cards).toHaveCount(4)
    const tops = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(tops).size, 'two rows of two, not one row of four').toBe(2)
  })
}
