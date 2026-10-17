// The mock's engine, copied as it is: the hours of every site by source (genSite), its sales and its incidents. Dev only.
import { CONV, CTYS, CURVE, D, END, NH, NS, PLANS, SCN, SI, SITES, SPK, type SaleEx, type Scn, type SiteDef } from './data'
import { gauss, hash, mulberry, pick, poisson } from './rand'

export interface Sale {
  min: number
  kind: string
  amt: number
  label: string
  s: number
  dev: number
  cty: number
  page: number
}
interface Inc {
  a: number
  b: number
}
export interface SiteData {
  H: Float32Array
  sales: Sale[]
  inc: Inc[]
}
export interface World {
  key: string
  sc: Scn
  /** Midnight of the first day, in ms. */
  start: number
  dow: number[]
  data: Record<string, SiteData>
  seed: number
}

const dDate = (start: number, d: number) => new Date(start + d * 864e5)

function ctyOf(ex: SaleEx, site: SiteDef, s: number, rr: () => number, sc: Scn): number {
  let c = ex.cty ?? pick(rr, site.ct[s])
  if (ex.cty == null && sc.noCty?.[site.id] === c) c = (c + 1) % CTYS.length
  return c
}

function genSite(site: SiteDef, sc: Scn, key: string, seed: number, dow: number[]): SiteData {
  const r = mulberry(hash(`${site.id}|${seed}|${key}`))
  const H = new Float32Array(NH * NS)
  const cv = CURVE[site.curve]
  const lv = 1
  for (let d = 0; d < D; d++) {
    const dm = (d === END && sc.quiet?.[site.id]) || 1
    for (let h = 0; h < 24; h++) {
      const since = sc.since?.[site.id]
      const bo = sc.boost?.[site.id]
      const v =
        site.base * cv[h] * site.wk[dow[d]] * (1 + (0.06 * d) / (D - 1)) * Math.exp(gauss(r) * 0.12) * lv * dm * (sc.lvl?.[site.id] || 1) * (since != null && d < since ? 0 : 1) * (bo && d >= bo[0] && d <= bo[1] ? bo[2] : 1)
      const o = (d * 24 + h) * NS
      for (let s = 0; s < NS; s++) if (site.sh[s]) H[o + s] = v * site.sh[s] * Math.exp(gauss(r) * 0.15)
    }
  }
  const sp: [number, number, number][] = site.spikes.map(([dd, h, m, src, pk]) => [(END + dd) * 1440 + h * 60 + m, SI[src], pk * lv])
  sc.spikes.filter((x) => x[0] === site.id).forEach(([, h, m, src, pk]) => sp.push([END * 1440 + h * 60 + m, SI[src], pk * lv]))
  sp.forEach(([at, s, pk]) => {
    const h0 = Math.floor(at / 60)
    const fr = 1 - (at % 60) / 60
    SPK.forEach((p, k) => {
      const i = h0 + k
      if (i < NH) H[i * NS + s] += pk * p * (k ? 1 : fr)
    })
  })
  const since = sc.since?.[site.id]
  if (since != null) for (let i = 0; i < Math.min(NH, since * 24) * NS; i++) H[i] = 0
  const inc: Inc[] = site.inc.map(([dd, h, m, dur]) => ({ a: (END + dd) * 1440 + h * 60 + m, b: (END + dd) * 1440 + h * 60 + m + dur }))
  sc.inc.filter((x) => x[0] === site.id).forEach(([, h, m, dur]) => inc.push({ a: END * 1440 + h * 60 + m, b: END * 1440 + h * 60 + m + dur }))
  const down = (min: number) => inc.some((i) => min >= i.a && min < i.b)
  inc.forEach((i) => {
    for (let hh = Math.floor(i.a / 60); hh < NH && hh * 60 < i.b; hh++) {
      const ov = Math.min(i.b, hh * 60 + 60) - Math.max(i.a, hh * 60)
      const k = Math.max(0, 1 - ov / 60)
      for (let s = 0; s < NS; s++) H[hh * NS + s] *= k
    }
  })
  const sales: Sale[] = []
  const mk = (kind: string, idx: number, sArg: number | null, rr: () => number, ex: SaleEx = {}): Sale | null => {
    let s = sArg
    if (s == null) {
      const w: number[] = []
      for (let q = 0; q < NS; q++) w.push(H[idx * NS + q])
      const t = w.reduce((p, q) => p + q, 0)
      s = t > 0 ? pick(rr, w.map((x) => x / t)) : 1
    }
    const min = idx * 60 + (ex.min ?? Math.floor(rr() * 60))
    if (down(min)) return null
    let amt: number
    let label: string
    if (site.money === 'saas') {
      const p = ex.plan ?? pick(rr, PLANS.map((x) => x[2]))
      const P = PLANS[p]
      if (kind === 'new') {
        amt = P[1]
        label = `New customer · ${P[0]} $${P[1]}/mo`
      } else if (kind === 'upgrade') {
        const pr = [
          [0, 1],
          [1, 2],
          [0, 2],
        ][pick(rr, [0.5, 0.35, 0.15])]
        amt = ex.amt || PLANS[pr[1]][1] - PLANS[pr[0]][1]
        label = ex.label || `Upgrade · ${PLANS[pr[0]][0]} → ${PLANS[pr[1]][0]}`
      } else if (kind === 'renewal') {
        amt = P[1]
        label = `Renewal · ${P[0]}`
      } else {
        amt = -P[1]
        label = `Refund · ${P[0]}`
      }
    } else if (kind === 'new') {
      amt = Math.round(24 + rr() * 110)
      label = 'New customer · order'
    } else if (kind === 'upgrade') {
      amt = ex.amt || 18
      label = ex.label || 'Upgrade · bigger box'
    } else if (kind === 'renewal') {
      amt = 32
      label = 'Renewal · monthly box'
    } else {
      amt = -Math.round(20 + rr() * 80)
      label = 'Refund · returned order'
    }
    const x: Sale = { min, kind, amt, label, s, dev: pick(rr, site.dv[s]), cty: ctyOf(ex, site, s, rr, sc), page: pick(rr, site.pg[s]) }
    sales.push(x)
    return x
  }
  if (site.money) {
    const noR = sc.noRand.includes(site.id)
    for (let i = 0; i < NH; i++) {
      const d = Math.floor(i / 24)
      if (noR && d === END) continue
      for (let s = 0; s < NS; s++) {
        const n = poisson(r, H[i * NS + s] * (site.paid ?? 0) * CONV[s])
        for (let k = 0; k < n; k++) mk('new', i, s, r)
      }
      const cf = cv[i % 24]
      const rates: [string, number | undefined][] = [
        ['upgrade', site.up],
        ['renewal', site.renew],
        ['refund', site.refund],
      ]
      rates.forEach(([k, rate]) => {
        const n = poisson(r, ((rate ?? 0) / 24) * cf * lv)
        for (let q = 0; q < n; q++) mk(k, i, null, r)
      })
    }
    sc.sales.filter((x) => x[0] === site.id).forEach(([, h, m, kind, src, ex], j) => mk(kind, END * 24 + h, SI[src], mulberry(hash(`scn${j}`)), { ...ex, min: m }))
  }
  sales.sort((p, q) => p.min - q.min)
  return { H, sales, inc }
}

export function buildWorld(key: string, seed = 7): World {
  const sc = SCN[key]
  const start = Date.UTC(sc.date[0], sc.date[1], sc.date[2]) - END * 864e5
  const dow: number[] = []
  for (let d = 0; d < D; d++) dow.push(dDate(start, d).getUTCDay())
  const data: Record<string, SiteData> = {}
  SITES.forEach((s) => (data[s.id] = genSite(s, sc, key, seed, dow)))
  return { key, sc, start, dow, data, seed }
}
