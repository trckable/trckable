// Asks GitHub for the latest release (lib/update.ts) and remembers the answer.
// Nothing about this instance goes with the request.
import type { Latest } from './update'

export async function fetchLatest(url: string, cache: string, signal: AbortSignal): Promise<Latest | null> {
  try {
    const r = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/vnd.github+json' } })
    const body = r.ok ? ((await r.json()) as { tag_name?: string; html_url?: string; body?: string }) : null
    if (!body?.tag_name) return null
    const next: Latest = { v: body.tag_name.replace(/^v/, ''), at: Date.now(), url: body.html_url, notes: body.body?.slice(0, 1500) }
    try {
      localStorage.setItem(cache, JSON.stringify(next))
    } catch {
      /* storage blocked: asked again next time */
    }
    return next
  } catch {
    return null // offline, rate-limited, blocked: simply no notice
  }
}
