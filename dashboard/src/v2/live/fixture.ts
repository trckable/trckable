// Development-only sample data for Live: the walkthrough's own scenarios, so the view can be set beside it.
// `?fixture=hn` (busy, a Show HN post), `?fixture=empty` (nobody yet) and `?fixture=down` (the site not answering).
// `import.meta.env.DEV` is false in a production build, so nothing here is reachable (or shipped) there.
import type { LiveNow, NowVisit } from '../../features/live/api'
import { MINUTE } from '../../features/live/model'

export type FixtureKind = 'hn' | 'empty' | 'down'

const asked = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fixture') : null
/** Read once when the page loads, before the address is rewritten. */
export const FIXTURE: FixtureKind | null = asked === 'hn' || asked === 'empty' || asked === 'down' ? asked : null

/** The walkthrough's colours for its named sources. */
export const FIXTURE_COLORS: Record<string, string> = {
  Google: '#7f9cf5',
  Direct: '#8b8e94',
  'Hacker News': '#ff9a4a',
  Reddit: '#ff6b4a',
  X: '#d7dadf',
  Newsletter: '#c6ff3a',
  ChatGPT: '#3fd0b0',
  GitHub: '#b58cff',
  'trckable badge': '#f0c64a',
}

const BARS = [1.58, 1.23, 1.7, 1.34, 1.23, 1.57, 1.6, 1.77, 1.39, 1.45, 1.46, 1.89, 1.9, 2.14, 1.47, 1.36, 1.88, 1.26, 1.56, 1.79, 2.16, 2.02, 1.45, 1.32, 1.88, 2.18, 1.94, 1.77, 1.72, 1.44]
const MIX: [string, number][] = [['Hacker News', 0.4337], ['Google', 0.1856], ['Direct', 0.1355], ['GitHub', 0.0655], ['X', 0.0567], ['ChatGPT', 0.0442], ['Newsletter', 0.0388], ['Reddit', 0.0336], ['trckable badge', 0.0064]]
// Page, source, country, device, and whether it is the post's traffic (seen a moment ago).
const PEOPLE: [string, string, string, string, boolean][] = [
  ['/signup', 'Hacker News', 'US', 'Mobile', true],
  ['/', 'Hacker News', 'IN', 'Desktop', true],
  ['/', 'Hacker News', 'FR', 'Desktop', true],
  ['/', 'Hacker News', 'CA', 'Desktop', true],
  ['/signup', 'ChatGPT', 'DE', 'Mobile', false],
  ['/docs/self-host', 'Google', 'GB', 'Mobile', false],
  ['/pricing', 'ChatGPT', 'US', 'Desktop', false],
  ['/blog/why-no-cookies', 'Google', 'GB', 'Desktop', false],
  ['/', 'Hacker News', 'US', 'Desktop', true],
  ['/changelog', 'ChatGPT', 'GB', 'Mobile', false],
  ['/changelog', 'Hacker News', 'DE', 'Desktop', true],
  ['/', 'Hacker News', 'US', 'Desktop', true],
  ['/', 'Google', 'IN', 'Desktop', false],
  ['/', 'Google', 'GB', 'Mobile', false],
]

/** The last seven days as the walkthrough draws them (the tallest is 1). */
export const FIXTURE_WEEK = [0.4425, 0.39, 0.855, 1, 0.8875, 0.86, 0.61]

/** Every person in the sample has been seen this many seconds ago at most (the post's traffic is fresher). */
function recentOf(at: number): NowVisit[] {
  return PEOPLE.map(([path, channel, country, device, hot], i) => ({
    kind: 'pageview' as const,
    ts: at - (hot ? 4 + i * 3 : 70 + i * 17) * 1000,
    last: at - (hot ? 4 + i * 3 : 70 + i * 17) * 1000,
    visitor: `fx${i}`,
    path,
    channel,
    country,
    device,
  }))
}

/** The sample as the server would answer at `at` (unix ms). */
export function fixtureNow(kind: FixtureKind, at: number): LiveNow {
  const minute = Math.floor(at / MINUTE) * MINUTE
  const start = minute - 29 * MINUTE
  if (kind === 'hn') {
    return {
      at,
      start,
      minutes: BARS,
      online: PEOPLE.length,
      visitors: Math.round(BARS.reduce((n, b) => n + b, 0)),
      previous: 40,
      sources: MIX.map(([channel, v]) => ({ channel, visitors: Math.round(v * 1000) })),
      recent: recentOf(at),
      today: { visitors: 623, before: 564, compare: true, hours: [], last: [] },
    }
  }
  const quiet = new Array<number>(30).fill(0)
  if (kind === 'down') return { at, start, minutes: quiet, online: 0, visitors: 0, previous: 19, sources: [], recent: [], today: { visitors: 327, before: 373, compare: true, hours: [], last: [] } }
  return { at, start, minutes: quiet, online: 0, visitors: 0, previous: 0, sources: [], recent: [] }
}

/** When the sample site went down (unix seconds), for the `down` sample: 30 minutes ago. */
export const fixtureDownSince = (at: number) => Math.floor(at / 1000) - 30 * 60
