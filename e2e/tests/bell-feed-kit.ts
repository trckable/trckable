// The bell reads one list from the server (GET /me/notifications): these specs answer it with the rows they set up, so the
// shared database's other incidents, mentions and sales never count.
import type { Page } from '@playwright/test'
import { API } from '../playwright.config'

/** The id of the site with this domain, for the signed-in account (cookies must be set first). */
export async function siteIdOf(page: Page, domain: string): Promise<string> {
  const res = await page.request.get(`${API}/api/v1/sites`)
  const list = ((await res.json()) as { sites: { id: string; domain: string }[] }).sites
  return list.find((s) => s.domain === domain)?.id ?? ''
}

/** Answers the bell's list with these rows (called again for each read, so a spec can change them). */
export const mockFeed = (page: Page, rows: () => object[]) => page.route(/\/api\/v1\/me\/notifications$/, (route) => route.fulfill({ json: { notifications: rows() } }))

/** The calendar day this many days ago, in the browser's zone ("2026-10-30"). */
export const dayAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA')

/** A milestone row kept by the day. */
export const milestone = (site: string, step: string, value: number, daysAgo: number) => {
  const day = dayAgo(daysAgo)
  return { id: `mile:${site}:visitors:${step}`, kind: 'milestone', site, at: Math.floor(Date.now() / 1000) - daysAgo * 86_400, day, milestone: { kind: 'visitors', step, value, day, created_at: 1, new: false, shared: false } }
}
