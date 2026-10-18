// The sites the slimmer-menu prototype shows (development only): four as on Albi's account, or seven to see the search box.
import type { Site } from '../../lib/api'
import { protoParams } from './proto'

interface Def {
  id: string
  domain: string
  name: string
  today: number
  /** Minutes since the last visit. */
  idle: number
}

const FOUR: Def[] = [
  { id: 'trk', domain: 'trckable.com', name: 'trckable', today: 2, idle: 4 },
  { id: 'kal', domain: 'kalendarfestash.al', name: 'kalendarfestash', today: 30, idle: 2 },
  { id: 'tash', domain: 'tash.al', name: 'tash.', today: 0, idle: 3 * 1440 },
  { id: 'veni', domain: 'veniconstruction.com', name: 'veniconstruction.com', today: 0, idle: 9 * 60 },
]
const SEVEN: Def[] = [
  ...FOUR,
  { id: 'blog1', domain: 'blog.tash.al', name: 'Blog', today: 12, idle: 6 },
  { id: 'blog2', domain: 'blog.albas.al', name: 'Blog', today: 5, idle: 20 },
  { id: 'shop', domain: 'shop.kalendarfestash.al', name: 'Shop', today: 8, idle: 11 },
]

export function protoDefs(): Def[] | null {
  const { menu, sites } = protoParams()
  if (!menu) return null
  return sites === 7 || menu === 'd' || menu === 'e' ? SEVEN : FOUR
}

/** The /sites list: the real first site (so its pages work) and clones of another for the rest. */
export function protoSiteList(defs: Def[], real: (id: string) => Site, secs: (min: number) => number): Site[] {
  return defs.map((d) => {
    const base = real(d.id === 'trk' ? 'trk' : 'alb')
    return { ...base, id: d.id, domain: d.domain, name: d.name, last_event_at: secs(-d.idle), down_since: undefined, down_cause: undefined, check: undefined }
  })
}

export function protoOverview(defs: Def[]) {
  return defs.map((d) => ({
    id: d.id,
    domain: d.domain,
    name: d.name,
    visitors: d.today * 7,
    pageviews: d.today * 12,
    bounce_rate: 0.4,
    previous_visitors: d.today * 6,
    series: [3, 5, 4, 6, 2, 4, d.today],
    online: d.idle < 10 ? Math.min(d.today, 3) : 0,
    currency: 'USD',
    exponent: 2,
  }))
}
