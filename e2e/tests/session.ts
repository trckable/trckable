// One signed-in owner, shared by every suite that asks here and by every
// browser. Signing in is limited to ten tries in ten minutes from one
// address, and the other suites need theirs: the session is made once, by
// whichever worker gets there first. `name` only says who asked.
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { API } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'polish e2e password 1'

export async function session(_name: string): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'owner-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `owner-${Date.now()}@example.com`
  // Other suites add their people at the same moment: a busy database is
  // tried again.
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

/** Only one browser at a time past this point: for tests that change what
 *  the whole account shares (the site switcher's layout). */
export async function exclusive<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const lock = join(process.env.TRCKABLE_DATA_DIR!, name + '.running')
  for (let i = 0; ; i++) {
    try {
      openSync(lock, 'wx')
      break
    } catch {
      if (i > 1200) throw new Error(`${name}: waited two minutes for another browser`)
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  try {
    return await fn()
  } finally {
    rmSync(lock, { force: true })
  }
}

/** The report as a site with no payment provider connected answers it. Another suite connects one to example.com (landing.spec), and a suite about what an owner sees without payments must not depend on which ran first. */
export async function withoutPayments(page: Page) {
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    try {
      const res = await route.fetch()
      const body = await res.json()
      for (const r of [body.current, body.previous]) if (r) delete r.money
      await route.fulfill({ response: res, json: body })
    } catch {
      // A report still being asked for as the test ends: the page is gone, there is nobody to answer.
    }
  })
}
