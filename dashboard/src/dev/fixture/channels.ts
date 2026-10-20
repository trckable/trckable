// Channels in the fixture: the team's YouTube, Instagram and Threads, so the section can be tried without any app keys.
// `&channels=some` (the default) has all three connected, `part` two of them with Threads not set up on the server, `none`
// none of them. Disconnecting removes the account for the rest of the page's life. Dev only.
import type { ChannelAccount, ChannelCard, Channels, Platform } from '../../features/channels/api'
import { hash, mulberry } from './rand'
import { dateOf, type Ctx } from './report'
import { END } from './data'

const KEY = 'trckable:fixture:channels'
type Mode = 'some' | 'part' | 'none'

function modeOf(): Mode {
  const asked = new URLSearchParams(location.search).get('channels')
  try {
    if (asked) sessionStorage.setItem(KEY, asked)
    return ((asked ?? sessionStorage.getItem(KEY)) as Mode | null) ?? 'some'
  } catch {
    return (asked as Mode | null) ?? 'some'
  }
}

const PER_DAY: Record<Platform, number> = { youtube: 1400, instagram: 520, threads: 190 }
const HANDLES: Record<Platform, string[]> = { youtube: ['@makerstudio', '@makerclips'], instagram: ['@maker.studio'], threads: ['@maker.studio'] }

const gone = new Set<string>()
const idOf = (p: Platform, i: number) => `fx-${p}-${i}`

function accountsOf(p: Platform, mode: Mode): ChannelAccount[] {
  if (mode === 'none' || (mode === 'part' && p === 'threads')) return []
  return HANDLES[p].map((handle, i) => ({ id: idOf(p, i), platform: p, handle, created_at: 1_790_000_000 })).filter((a) => !gone.has(a.id)).map((a) => ({ ...a, last_ok_at: 1_792_000_000 }))
}

/** One day's views: a weekly shape and some noise, the same on every load. */
function viewsOn(p: Platform, accounts: number, day: number): number {
  const r = mulberry(hash(p) + day)
  const week = 1 + 0.25 * Math.sin((day % 7) / 7 * Math.PI * 2)
  return Math.round(PER_DAY[p] * (accounts > 1 ? 1.6 : 1) * week * (0.85 + r() * 0.3))
}

function card(c: Ctx, p: Platform, days: number, mode: Mode): ChannelCard {
  const accounts = accountsOf(p, mode)
  const out: ChannelCard = { platform: p, ready: !(mode === 'part' && p === 'threads') && !(mode === 'none' && p === 'threads'), accounts, monitoring: accounts.length, series: [] }
  if (accounts.length === 0) return out
  const from = END - days + 1
  let sum = 0
  for (let d = from; d <= END; d++) {
    const v = viewsOn(p, accounts.length, d)
    sum += v
    out.series.push({ day: dateOf(c, d), views: v })
  }
  out.views = sum
  // Threads started late: its history does not reach back a full second period.
  if (p === 'threads') out.from = dateOf(c, END - 20)
  else out.previous = Array.from({ length: days }, (_, i) => viewsOn(p, accounts.length, from - 1 - i)).reduce((n, v) => n + v, 0)
  return out
}

export function channelsAnswer(c: Ctx, method: string, path: string, sp: URLSearchParams): { status: number; body: unknown } | null {
  const drop = /^\/channels\/accounts\/([^/]+)$/.exec(path)
  if (drop && method === 'DELETE') {
    gone.add(decodeURIComponent(drop[1]))
    return { status: 204, body: undefined }
  }
  if (path !== '/channels' || method !== 'GET') return null
  const days = [7, 30, 90].includes(Number(sp.get('days'))) ? Number(sp.get('days')) : 30
  const mode = modeOf()
  const body: Channels = { days, through: dateOf(c, END), platforms: (['youtube', 'instagram', 'threads'] as const).map((p) => card(c, p, days, mode)) }
  return { status: 200, body }
}
