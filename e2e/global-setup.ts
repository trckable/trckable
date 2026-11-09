// The suite's seeded sites (made with `trckabled site add`) start cookieless like
// every new site. Most specs follow a visitor across pages and days, so they run
// in cookie mode; the specs about the default make their own site.
import { API, TOKEN } from './playwright.config'

export default async function globalSetup() {
  const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
  const listed = (await (await fetch(`${API}/api/v1/sites`, { headers })).json()) as { sites: { id: string }[] }
  for (const { id } of listed.sites) {
    const url = `${API}/api/v1/sites/${id}/config`
    const cfg = (await (await fetch(url, { headers })).json()) as Record<string, unknown>
    const put = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ ...cfg, consent_free: false, honor_dnt: false, record_city: true }) })
    if (!put.ok) throw new Error(`could not set cookie mode on ${id}: ${put.status}`)
  }
}
