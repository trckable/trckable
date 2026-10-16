// A site's visitors, drawn from the mock's hours: every hour's count by source is kept exactly, and what the mock only
// weighs (the country, the device, the page) is drawn per visitor from the same weights. Dev only.
import { BOUNCE, CONV, DEVS, NS, SITES, type SiteDef } from './data'
import type { World } from './engine'
import { hash, mulberry, pick } from './rand'

export interface Goal {
  key: string
  label: string
  /** The share of an hour's visitors it counts, by source. */
  w: (s: number) => number
}

export interface Visits {
  site: SiteDef
  n: number
  /** The minute (from the first day's midnight) of each visit; visits are in time order. */
  t: Float32Array
  s: Uint8Array
  dev: Uint8Array
  cty: Uint8Array
  /** The page it came in on, as the site's page index. */
  pg: Uint8Array
  np: Uint8Array
  dur: Uint16Array
  bounced: Uint8Array
  br: Uint8Array
  /** Which of the site's goals each reached, a bit apiece. */
  goals: Uint16Array
  list: Goal[]
}

export const BROWSERS = ['Chrome', 'Chrome', 'Safari', 'Firefox', 'Edge']
const OS: Record<string, string[]> = { Desktop: ['macOS', 'Windows', 'Linux'], Mobile: ['iOS', 'Android'], Tablet: ['iOS', 'Android'] }
export const osOf = (dev: number, v: number): string => OS[DEVS[dev].name][v % OS[DEVS[dev].name].length]

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** The goals a visitor can reach: the funnel's steps after the first (the last one is a sale when the site has them), then the site's own. */
export function goalsOf(site: SiteDef): Goal[] {
  const out: Goal[] = []
  site.rates.forEach((rate, i) => {
    const k = i + 1
    out.push({ key: slug(site.funnel[k]), label: site.funnel[k], w: (s) => rate * (k === 1 ? Math.sqrt(CONV[s]) : CONV[s]) })
  })
  site.goals.forEach(([name, rate]) => out.push({ key: slug(name), label: name, w: (s) => rate * Math.sqrt(CONV[s]) }))
  return out
}

function buildVisits(w: World, site: SiteDef, nowAbs: number): Visits {
  const H = w.data[site.id].H
  const list = goalsOf(site)
  const r = mulberry(hash(`${site.id}|visits|${w.key}|${w.seed}`))
  // The mock's hours are fractions of a person; what is carried over from one hour to the next keeps a day's total what the mock's is.
  const hours = Math.min(H.length / NS, Math.ceil(nowAbs / 60))
  const counts = new Uint16Array(hours * NS)
  const carry = new Float64Array(NS)
  let total = 0
  for (let i = 0; i < hours; i++) {
    const fr = Math.min(1, (nowAbs - i * 60) / 60)
    for (let s = 0; s < NS; s++) {
      const want = H[i * NS + s] * fr + carry[s]
      const k = Math.max(0, Math.round(want))
      carry[s] = want - k
      counts[i * NS + s] = k
      total += k
    }
  }
  const v: Visits = {
    site,
    n: total,
    t: new Float32Array(total),
    s: new Uint8Array(total),
    dev: new Uint8Array(total),
    cty: new Uint8Array(total),
    pg: new Uint8Array(total),
    np: new Uint8Array(total),
    dur: new Uint16Array(total),
    bounced: new Uint8Array(total),
    br: new Uint8Array(total),
    goals: new Uint16Array(total),
    list,
  }
  const bcarry = new Float64Array(NS)
  let n = 0
  for (let i = 0; i < hours; i++) {
    const hStart = i * 60
    const fr = Math.min(1, (nowAbs - hStart) / 60)
    const first = n
    for (let s = 0; s < NS; s++) {
      const cnt = counts[i * NS + s]
      for (let k = 0; k < cnt; k++) {
        v.t[n] = hStart + Math.floor(r() * 60 * fr)
        v.s[n] = s
        v.dev[n] = pick(r, site.dv[s])
        v.cty[n] = pick(r, site.ct[s])
        v.pg[n] = pick(r, site.pg[s])
        // Who leaves after one page is spread evenly, so the day's share is the source's own, as in the mock.
        bcarry[s] += BOUNCE[s]
        const b = bcarry[s] >= 1
        if (b) bcarry[s] -= 1
        v.bounced[n] = b ? 1 : 0
        v.np[n] = b ? 1 : 2 + Math.floor(r() * 3)
        v.dur[n] = b ? Math.floor(r() * 8) : Math.round((v.np[n] - 1) * (30 + r() * 40))
        v.br[n] = Math.floor(r() * BROWSERS.length)
        n++
      }
    }
    // The hour's goals: as many as the mock counts, given to the hour's visitors that suit them.
    if (n > first) {
      list.forEach((g, gi) => {
        let want = 0
        let top = 0
        for (let s = 0; s < NS; s++) {
          want += H[i * NS + s] * g.w(s)
          top = Math.max(top, g.w(s))
        }
        want = Math.round(want * fr)
        for (let tries = 0; want > 0 && tries < want * 40; tries++) {
          const x = first + Math.floor(r() * (n - first))
          if (v.goals[x] & (1 << gi) || r() * top > g.w(v.s[x])) continue
          v.goals[x] |= 1 << gi
          want--
        }
      })
    }
  }
  return v
}

/** One site's visitors, kept for as long as the page lives. */
const kept = new Map<string, Visits>()
export function visitsOf(w: World, siteId: string, nowAbs: number): Visits {
  const key = `${w.key}|${siteId}|${nowAbs}`
  let v = kept.get(key)
  if (!v) {
    const site = SITES.find((s) => s.id === siteId)
    if (!site) throw new Error(`fixture: no site ${siteId}`)
    v = buildVisits(w, site, nowAbs)
    kept.set(key, v)
  }
  return v
}

