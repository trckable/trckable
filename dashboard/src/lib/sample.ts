// A believable dashboard for a site that has not been installed yet.
//
// Instead of a wall of zeros, the dashboard renders this sample softly out of
// focus behind the install card, so the shape of the thing you are about to get
// is visible. It is generated from the site id, so it never flickers between
// renders, and it never touches the API: nothing here can be mistaken for real
// data, because the site has none.
import type { Day, KPIs, Point, Report, Result, Row } from './api'

/** Small deterministic PRNG, seeded from the site id. */
function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SHAPES: Record<string, [string, number][]> = {
  channel: [
    ['Search', 34],
    ['Direct', 24],
    ['Social', 16],
    ['Referral', 12],
    ['AI', 9],
    ['Email', 5],
  ],
  referrer: [
    ['google.com', 30],
    ['linkedin.com', 18],
    ['x.com', 14],
    ['reddit.com', 11],
    ['chatgpt.com', 9],
    ['producthunt.com', 6],
  ],
  campaign: [
    ['launch', 21],
    ['newsletter-09', 14],
    ['changelog', 9],
  ],
  entry_page: [
    ['/', 41],
    ['/pricing', 16],
    ['/blog/how-we-built-it', 12],
    ['/docs', 9],
    ['/changelog', 6],
  ],
  page: [
    ['/', 44],
    ['/pricing', 21],
    ['/docs', 15],
    ['/blog/how-we-built-it', 11],
    ['/signup', 7],
  ],
  exit_page: [
    ['/', 28],
    ['/pricing', 22],
    ['/docs', 14],
    ['/signup', 9],
  ],
  country: [
    ['US', 31],
    ['DE', 17],
    ['GB', 11],
    ['FR', 8],
    ['IN', 7],
    ['NL', 5],
  ],
  device: [
    ['Desktop', 58],
    ['Mobile', 36],
    ['Tablet', 6],
  ],
  browser: [
    ['Chrome', 52],
    ['Safari', 27],
    ['Firefox', 12],
    ['Edge', 9],
  ],
  os: [
    ['macOS', 38],
    ['Windows', 31],
    ['iOS', 18],
    ['Android', 13],
  ],
}

const GOALS: [string, number][] = [
  ['signup', 42],
  ['trial_started', 18],
  ['docs_read', 11],
]

function rows(shape: [string, number][], visitors: number, r: () => number): Row[] {
  const total = shape.reduce((a, [, w]) => a + w, 0)
  return shape.map(([value, w]) => {
    const v = Math.max(1, Math.round((visitors * w) / total / (1 + (r() - 0.5) * 0.2)))
    return {
      value,
      visitors: v,
      sessions: Math.round(v * 1.2),
      pageviews: Math.round(v * 2.6),
      bounce_rate: 0.3 + r() * 0.3,
    }
  })
}

function kpisFor(visitors: number, r: () => number): KPIs {
  const sessions = Math.round(visitors * 1.24)
  return {
    visitors,
    sessions,
    pageviews: Math.round(sessions * (2.2 + r() * 0.8)),
    bounce_rate: 0.38 + r() * 0.1,
    avg_session_s: Math.round(95 + r() * 60),
    views_per_session: 2.4 + r() * 0.5,
    new_visitor_share: 0.55 + r() * 0.2,
  }
}

function result(dates: string[], seed: string, scale: number): Result {
  const r = rng(seed)
  const series: Point[] = []
  const days: Day[] = []
  let base = 90 + r() * 40
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i] + 'T00:00:00')
    const weekend = d.getDay() === 0 || d.getDay() === 6
    base *= 1 + (r() - 0.45) * 0.08 // a gentle drift, mostly upwards
    const visitors = Math.max(6, Math.round(base * (weekend ? 0.62 : 1) * (0.85 + r() * 0.3) * scale))
    series.push({ t: dates[i] + 'T00:00', visitors, pageviews: Math.round(visitors * 2.7) })
    days.push({ date: dates[i], kpis: kpisFor(visitors, r), dims: {} })
  }
  const visitors = series.reduce((a, p) => a + p.visitors, 0)
  const dims: Record<string, Row[]> = {}
  for (const k of Object.keys(SHAPES)) dims[k] = rows(SHAPES[k], visitors, r)
  return { approximate: false, kpis: kpisFor(visitors, r), series, dims, goals: rows(GOALS, visitors * 0.3, r), days }
}

function listDays(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out.length ? out : [from]
}

/** A whole sample report for the period on screen. */
export function sampleReport(site: string, timezone: string, from: string, to: string): Report {
  const dates = listDays(from, to)
  return {
    site,
    timezone,
    bucket: 'day',
    from,
    to,
    current: result(dates, site + from, 1),
    previous: result(dates, site + from + 'p', 0.86),
    online: 3,
  }
}
