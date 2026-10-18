// A site whose every figure was counted by hand, for explore-truth.spec.ts. Visitors have one visit each, noon UTC on
// days inside the last seven (the period under test) and, for the comparison, inside the seven before it.
//
//   profile  who                                                         people  pages
//   P1  google.com, Germany/Berlin/Berlin, Desktop Chrome Windows         12     / then /pricing; the first 4 sign up after
//   P2  google.com, Germany/Bavaria/Munich, Desktop Firefox Linux          6     /pricing
//   P3  news.ycombinator.com, US/California/San Francisco, Mobile Safari   5     /
//   P4  chatgpt.com, US/Texas/Austin, Desktop Chrome macOS                 4     /blog
//   P5  direct, UK/England/London, Tablet Chrome Android                   7     /
//   P6  utm launch/newsletter/email, Germany/Hesse/Frankfurt, Mobile       3     /pricing
//
// Before the period (the same seven days earlier): 10 from google.com (Germany, /), 5 from news.ycombinator.com (US, /)
// and 8 direct (UK, /pricing): 23 people.
export const TRUTH_DOMAIN = 'truth.example'

interface Profile {
  n: number
  referrer: string
  channel: string
  country: string
  region: string
  city: string
  device: string
  browser: string
  os: string
  pages: string[]
  signups?: number
  campaign?: string
  source?: string
  medium?: string
}

const NOW: Profile[] = [
  { n: 12, referrer: 'google.com', channel: 'Search', country: 'DE', region: 'Berlin', city: 'Berlin', device: 'Desktop', browser: 'Chrome', os: 'Windows', pages: ['/', '/pricing'], signups: 4 },
  { n: 6, referrer: 'google.com', channel: 'Search', country: 'DE', region: 'Bavaria', city: 'Munich', device: 'Desktop', browser: 'Firefox', os: 'Linux', pages: ['/pricing'] },
  { n: 5, referrer: 'news.ycombinator.com', channel: 'Social', country: 'US', region: 'California', city: 'San Francisco', device: 'Mobile', browser: 'Safari', os: 'iOS', pages: ['/'] },
  { n: 4, referrer: 'chatgpt.com', channel: 'AI', country: 'US', region: 'Texas', city: 'Austin', device: 'Desktop', browser: 'Chrome', os: 'macOS', pages: ['/blog'] },
  { n: 7, referrer: '', channel: 'Direct', country: 'GB', region: 'England', city: 'London', device: 'Tablet', browser: 'Chrome', os: 'Android', pages: ['/'] },
  { n: 3, referrer: '', channel: 'Email', country: 'DE', region: 'Hesse', city: 'Frankfurt', device: 'Mobile', browser: 'Chrome', os: 'Android', pages: ['/pricing'], campaign: 'launch', source: 'newsletter', medium: 'email' },
]

const BEFORE: Profile[] = [
  { n: 10, referrer: 'google.com', channel: 'Search', country: 'DE', region: 'Berlin', city: 'Berlin', device: 'Desktop', browser: 'Chrome', os: 'Windows', pages: ['/'] },
  { n: 5, referrer: 'news.ycombinator.com', channel: 'Social', country: 'US', region: 'California', city: 'San Francisco', device: 'Mobile', browser: 'Safari', os: 'iOS', pages: ['/'] },
  { n: 8, referrer: '', channel: 'Direct', country: 'GB', region: 'England', city: 'London', device: 'Tablet', browser: 'Chrome', os: 'Android', pages: ['/pricing'] },
]

/** The file `trckabled import` reads: one JSON line per pageview or goal. */
export function truthRows(now = Date.now()): string[] {
  const noon = Math.floor(now / 86_400_000) * 86_400_000 + 12 * 3_600_000
  const out: string[] = []
  const add = (list: Profile[], daysAgo: number[], tag: string) => {
    list.forEach((p, k) => {
      for (let i = 0; i < p.n; i++) {
        const at = noon - daysAgo[i % daysAgo.length] * 86_400_000 + k * 600_000 + i * 20_000
        const visitor = `truth-${tag}-${k}-${i}`
        const base = { visitor, referrer: p.referrer, channel: p.channel, country: p.country, region: p.region, city: p.city, device: p.device, browser: p.browser, os: p.os, campaign: p.campaign, source: p.source, medium: p.medium }
        p.pages.forEach((path, j) => out.push(JSON.stringify({ ...base, ts: new Date(at + j * 30_000).toISOString(), path })))
        if (i < (p.signups ?? 0)) out.push(JSON.stringify({ ...base, ts: new Date(at + 120_000).toISOString(), path: p.pages.at(-1), goal: 'signup' }))
      }
    })
  }
  add(NOW, [1, 2, 3], 'now')
  add(BEFORE, [8, 9, 10], 'before')
  return out
}
