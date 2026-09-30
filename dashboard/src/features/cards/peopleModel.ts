// The People card's rows, made of the site's latest events: one person per
// visit, their entry page, where from, how many pages and how long. Pure:
// peopleModel.test.ts.
export interface EventRow {
  seq?: number
  ts: string
  kind: string
  visitor?: string
  session?: string
  path?: string
  goal?: string
  channel?: string
  referrer?: string
  country?: string
  device?: string
  engaged_ms?: number
}

export interface Person {
  visitor: string
  /** The page they came in on. */
  path: string
  channel: string
  referrer?: string
  country?: string
  device?: string
  pages: number
  /** From their first event here to their last, in seconds. */
  seconds: number
  /** When they were last seen, unix ms. */
  last: number
}

/** The newest `limit` people, each once, from events newest first. */
export function peopleOf(events: EventRow[], limit = 8): Person[] {
  const by = new Map<string, EventRow[]>()
  for (const e of events) {
    if (!e.visitor || !e.session) continue
    const key = e.visitor + ':' + e.session
    by.set(key, [...(by.get(key) ?? []), e])
  }
  const seen = new Set<string>()
  const out: Person[] = []
  for (const list of by.values()) {
    const visitor = list[0].visitor as string
    if (seen.has(visitor)) continue
    seen.add(visitor)
    const oldest = [...list].reverse() // events come newest first
    const views = oldest.filter((e) => e.kind === 'pageview')
    const first = views[0] ?? oldest[0]
    const times = list.map((e) => Date.parse(e.ts))
    out.push({
      visitor,
      path: first.path || first.goal || '/',
      channel: first.channel || 'Direct',
      referrer: first.referrer || undefined,
      country: first.country || undefined,
      device: first.device || undefined,
      pages: views.length,
      seconds: Math.round((Math.max(...times) - Math.min(...times)) / 1000),
      last: Math.max(...times),
    })
    if (out.length >= limit) break
  }
  return out
}

/** "now", "3m", "2h", "4d": how long ago, in the fewest characters. */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 30) return 'now'
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** "2m", "45s": how long a visit lasted. */
export function span(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)}m`
}
