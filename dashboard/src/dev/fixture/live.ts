// What Live reads: the last half hour, who is on the site now, and which sources are above their usual. Counted from the
// mock's own hours the way the mock's Live does. Dev only.
import type { Busier, LiveNow, NowVisit } from '../../features/live/api'
import { CTYS, DEVS, END, NS, SRCS, type SiteDef } from './data'
import { countIn, online, REFS, siteOf, type Ctx } from './report'
import { hash, mulberry, pick } from './rand'

const MINUTE = 60000

/** People a minute, as the mock draws them: the hour's share of that minute, a little uneven. */
function perMin(c: Ctx, site: SiteDef, m: number): number {
  const d = c.w.data[site.id]
  if (m < 0 || d.inc.some((i) => m >= i.a && m < i.b)) return 0
  let hv = 0
  for (let s = 0; s < NS; s++) hv += d.H[Math.floor(m / 60) * NS + s]
  return (hv / 60) * (0.7 + 0.6 * mulberry(hash(`${site.id}:${m}:${c.w.seed}`))())
}

/** The mock's usual for one figure by now: the same weekday's last four weeks, up to this time. */
function usualOf(c: Ctx, id: string, filters: Parameters<typeof countIn>[4]) {
  const cut = c.nowAbs - END * 1440
  const xs = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => countIn(c, id, (END - 7 * k) * 1440, (END - 7 * k) * 1440 + cut, filters)).sort((a, b) => a - b)
  const q = (t: number) => xs[Math.round(t * (xs.length - 1))]
  const mid = q(0.5)
  const m = 1.3 * ((q(0.8) - q(0.2)) / 2) + 0.06 * mid
  return { c: mid, lo: Math.max(0, mid - m), hi: mid + m }
}

export function nowOf(c: Ctx, id: string): LiveNow {
  const site = siteOf(id)
  const at = c.w.start + c.nowAbs * MINUTE
  const now = Math.floor(c.nowAbs)
  const minutes: number[] = []
  for (let k = 29; k >= 0; k--) minutes.push(perMin(c, site, now - k))
  let previous = 0
  for (let k = 30; k < 60; k++) previous += perMin(c, site, now - k)
  const hour = Math.floor(now / 60)
  const mix = SRCS.map((_, s) => c.w.data[id].H[hour * NS + s])
  const tot = mix.reduce((p, q) => p + q, 0)
  const n = online(c, site)
  const r = mulberry(hash(`${id}|live|${Math.floor(now / 2)}`))
  const recent: NowVisit[] = []
  if (tot > 0)
    for (let i = 0; i < Math.min(40, n); i++) {
      const s = pick(r, mix.map((x) => x / tot))
      const dv = pick(r, site.dv[s])
      const ct = pick(r, site.ct[s])
      const ts = at - (4 + i * 5) * 1000
      recent.push({ kind: 'pageview', ts, last: ts, visitor: `lv${i}`, path: site.pages[pick(r, site.pg[s])][0], channel: SRCS[s].name, country: CTYS[ct].id, device: DEVS[dv].name })
    }
  const today = countIn(c, id, END * 1440, c.nowAbs + 1, [])
  const out: LiveNow = {
    at,
    start: (Math.floor(at / MINUTE) - 29) * MINUTE,
    minutes,
    online: n,
    visitors: Math.round(minutes.reduce((p, q) => p + q, 0)),
    previous: Math.round(previous),
    sources: SRCS.map((s, i) => ({ channel: s.name, visitors: Math.round((tot > 0 ? mix[i] / tot : 0) * 1000) })).sort((a, b) => b.visitors - a.visitors),
    recent,
  }
  if (c.w.sc.since?.[id] == null || today > 0) out.today = { visitors: today, before: Math.round(usualOf(c, id, []).c), compare: true, hours: [], last: [] }
  return out
}

/** The sources above their usual right now, as the mock's feed marks them. */
export function busierOf(c: Ctx, id: string): Busier {
  const why = SRCS.flatMap((s) => {
    const host = REFS[s.id]
    if (!host) return []
    const f = [{ dim: 'referrer', not: false, value: host }]
    const v = countIn(c, id, END * 1440, c.nowAbs + 1, f)
    const b = usualOf(c, id, f)
    return v > b.hi + 0.5 ? [{ dim: 'source' as const, value: s.name, now: v, usual: Math.round(b.c), plus: Math.round(v - b.c) }] : []
  })
  return { now: online(c, siteOf(id)), baseline: false, usual: 0, low: 0, high: 0, state: '', rest: 0, why }
}
