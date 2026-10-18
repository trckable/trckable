// What the flow specs share: one signed-in owner for the whole run, a page opened on the site with a few days behind it
// (a phone or a desktop, dark or light), and a count of what is on screen over the page, so that "one overlay at a time"
// is a number the specs can assert.
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import type { Page } from './fixtures'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'flows e2e password 1'

/** One session for every spec that asks, made by whichever worker gets there first (signing in is rate limited). */
export async function flowSession(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'flows-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `flows-${Date.now()}@example.com`
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

export type Look = { width: number; scheme: 'dark' | 'light' }
export const LOOKS: Look[] = [
  { width: 1440, scheme: 'dark' },
  { width: 390, scheme: 'light' },
]

/** The site with a few days behind it, opened signed in. `path` is what follows the domain (a query, say). */
export async function openFlow(page: Page, cookie: string, look: Look, path = '?view=briefing') {
  await page.setViewportSize({ width: look.width, height: look.width < 500 ? 844 : 900 })
  await page.emulateMedia({ colorScheme: look.scheme })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}${path}`)
}

/** What is open over the page, in sight and reachable: dialogs and the Briefing's sheets. Two means two stacked. */
export function overlays(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = (e: Element) => {
      const r = e.getBoundingClientRect()
      const s = getComputedStyle(e)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[inert]') && !e.closest('.leaving')
    }
    const dialogs = [...document.querySelectorAll('.modal-back [role=dialog], .cd.on')].filter(seen)
    return dialogs.map((e) => e.getAttribute('aria-label') ?? e.className.toString())
  })
}
