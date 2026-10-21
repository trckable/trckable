// The other sections' answers, said as Explore's models. Pure: mapSections.test.ts.
import { MIN_VITALS } from '../../../lib/api'
import type { CrawlerReport, FunnelResult, FunnelStep, Money, PaidStep, Report, SearchReport, SearchRow as ApiSearchRow, WebVitals } from '../../../lib/api'
import { fmtDay } from '../../../lib/dates'
import { fmtFixed, fmtInt, dateFmt } from '../../../lib/format'
import { averagePosition } from '../../../lib/searchPosition'
import type { Mention as ApiMention } from '../../../features/mentions/api'
import { baseEnough } from '../../../lib/thin'
import { copy } from '../copy'
import type { Bot, Funnel, Goal, Grade, Mention, Row, Sale, Sales, Search, SearchRow, SlowPage, Speed, Step, Xkc } from '../types'
import { statOf } from './stats'

// ---- funnel and goals ----

/** The first step where fewer go on than usual, with the share who do and the share who usually do. */
export function leakOf(steps: Step[]): Funnel['leak'] {
  let at = -1
  let r = 0
  let ur = 0
  steps.forEach((s, i) => {
    if (!i || at >= 0) return
    const p = steps[i - 1]
    const rr = p.v ? s.v / p.v : 0
    const u = p.c ? s.c / p.c : 0
    const rel = u ? rr / u : 1
    if (p.v >= 5 && rel < 0.75) {
      at = i
      r = rr
      ur = u
    }
  })
  return { at, r, ur }
}

/** The last step of a funnel on a site with payments: the visitors of the step before who then paid. */
export const PAID_STEP: PaidStep = { kind: 'paid', value: 'paid' }

/** The funnel's steps: those an old address names ("fs=page:/pricing"), else the two busiest entry pages and the first goal; with payments connected, a Paid step at the end. */
export function stepsOf(wanted: (FunnelStep | PaidStep)[] | undefined, pages: { value: string }[], goal?: { value: string }, paid = false): (FunnelStep | PaidStep)[] {
  const steps: (FunnelStep | PaidStep)[] = wanted && wanted.length >= 2 ? wanted : [...pages.slice(0, 2).map((p) => ({ kind: 'page' as const, value: p.value })), ...(goal ? [{ kind: 'goal' as const, value: goal.value }] : [])]
  return paid && steps.length >= 1 && steps.length < 8 && !steps.some((s) => s.kind === 'paid') ? [...steps, PAID_STEP] : steps
}

export function mapFunnel(o: { cur: FunnelResult[]; prev?: FunnelResult[]; report: Report; ghost: boolean }): Funnel {
  const { cur, prev, report } = o
  const base = !!report.previous && baseEnough(report.previous.kpis.visitors)
  const stepName = (s: FunnelResult, i: number): string => {
    if (s.kind !== 'paid') return s.label || s.value
    return i > 0 ? copy.paidAfter(cur[i - 1].label || cur[i - 1].value) : copy.paid
  }
  const steps: Step[] = cur.map((s, i) => ({ name: stepName(s, i), v: s.visitors, c: prev?.[i]?.visitors ?? 0 }))
  const goals: Goal[] = (report.current.goals ?? []).map((g) => ({ name: g.label || g.value, ...statOf(g.visitors, report.previous?.goals?.find((p) => p.value === g.value)?.visitors, base) }))
  const pages = (report.current.dims.page ?? []).map((r) => ({ name: r.value, ...statOf(r.visitors, report.previous?.dims.page?.find((p) => p.value === r.value)?.visitors, base) }))
  const spec = cur.flatMap((s) => (s.kind === 'page' || s.kind === 'goal' ? [{ kind: s.kind, value: s.value }] : []))
  return { steps, spec, leak: leakOf(steps), goals, vs: copy.vsUsual, ghost: o.ghost, goalsOn: goals.length > 0, pages }
}

// ---- sales ----

/** What the period earned, by kind: there is no list of single sales to read, so each kind is one line. The kinds are what was paid and the refunds come off as their own line, so the lines add up to the period's net revenue (what the Briefing and the buyers say). A period with no payment says there are none. */
export function mapSales(money: Money | undefined, label: string): Sales {
  if (!money) return { state: 'connect', sales: [] }
  const one = (kind: Sale['kind'], text: string, amt: number): Sale[] => (amt === 0 ? [] : [{ kind, label: text, from: '', country: '', device: '', when: label, amt }])
  const sales = [...one('new', copy.salesNew, money.new_gross), ...one('upgrade', copy.salesUpgrade, money.upgrade_gross), ...one('renewal', copy.salesRenewal, money.renewal_gross), ...one('refund', copy.salesRefund, -money.refunds)]
  return { state: money.payments === 0 && sales.length === 0 ? 'none' : 'ok', sales }
}

// ---- search ----

const fmtK = (n: number) => (n >= 1000 ? `${fmtFixed(n / 1000, n >= 10000 ? 0 : 1)}k` : fmtInt(n))
const pct1 = (x: number) => `${fmtFixed(x * 100, 1)}%`

/** Position is the one number where lower is better: a move of half a place or more up is good, down is bad. */
const movedOf = (pos: number, was: number): string => {
  if (pos < was - 0.5) return 'up'
  return pos > was + 0.5 ? 'dn' : ''
}

function tagOf(st: string): { tag: string; tone: Xkc['tone'] } {
  if (st === 'up') return { tag: copy.aboveUsual, tone: 'up' }
  return st === 'dn' ? { tag: copy.belowUsual, tone: 'dn' } : { tag: copy.asUsual, tone: '' }
}

const rowOf = (r: ApiSearchRow, name: string, fresh: boolean): SearchRow => ({ name, clicks: r.clicks, impr: r.impressions, ctr: r.ctr, pos: r.position, ...(fresh ? { fresh: true } : {}) })

export function mapSearch(o: { query: SearchReport; pages: SearchReport; prev?: SearchReport }): Search {
  const { query, pages, prev } = o
  const base = prev !== undefined && prev.clicks >= 5
  const clicks = statOf(query.clicks, prev?.clicks, base)
  const impr = statOf(query.impressions, prev?.impressions, base)
  const ctr = query.impressions ? query.clicks / query.impressions : 0
  const ctr0 = prev?.impressions ? prev.clicks / prev.impressions : 0
  const ctrSt = base && ctr < ctr0 * 0.88 ? 'dn' : ''
  const pos = averagePosition(query.rows)
  const pos0 = prev ? averagePosition(prev.rows) : 0
  const posSt = base ? movedOf(pos, pos0) : ''
  // With nothing to count from (no period before, or one too thin), no usual is told: no tag, no range.
  const kc = (icon: string, label: string, val: string, st: string, detail: string): Xkc => (base ? { icon, label, val, ...tagOf(st), detail } : { icon, label, val, tag: '', tone: '', detail: '' })
  const known = new Set((prev?.rows ?? []).map((r) => r.key))
  return {
    on: true,
    enough: (query.rows?.length ?? 0) > 0 || query.clicks > 0,
    kcs: [
      kc('click', copy.heads.clicks, fmtInt(query.clicks), clicks.st, `${copy.usual} ${fmtInt(clicks.lo)}–${fmtInt(clicks.hi)}`),
      kc('people', copy.impressions, fmtK(query.impressions), impr.st, `${copy.usual} ${fmtK(impr.lo)}–${fmtK(impr.hi)}`),
      kc('goal', copy.clickRate, pct1(ctr), ctrSt, `${copy.usual} ${pct1(ctr0 * 0.88)}–${pct1(ctr0 * 1.12)}`),
      kc('uptime', copy.position, fmtFixed(pos, 1), posSt, `${copy.usual} ${fmtFixed(pos0, 1)}, ${copy.lowerBetter}`),
    ],
    queries: (query.rows ?? []).map((r) => rowOf(r, `“${r.key}”`, base && !known.has(r.key))),
    pages: (pages.rows ?? []).map((r) => rowOf(r, r.key, false)),
  }
}

// ---- speed ----

export const gradeOf = (i: 0 | 1 | 2, v: number): Grade => {
  const [good, mid] = [[2.5, 4], [200, 500], [0.1, 0.25]][i]
  if (v <= good) return 'good'
  return v <= mid ? 'mid' : 'poor'
}

const written = (i: 0 | 1 | 2, v: number): string => {
  if (i === 0) return `${fmtFixed(v, 1)} s`
  return i === 1 ? `${Math.round(v)} ms` : fmtFixed(v, 2)
}

export function mapSpeed(cur: WebVitals, prev?: WebVitals): Speed {
  const now = [(cur.lcp_ms ?? 0) / 1000, cur.inp_ms ?? 0, (cur.cls_1k ?? 0) / 1000] as const
  const was = prev ? ([(prev.lcp_ms ?? 0) / 1000, prev.inp_ms ?? 0, (prev.cls_1k ?? 0) / 1000] as const) : null
  const have = [cur.lcp_ms, cur.inp_ms, cur.cls_1k]
  // Built from how many page views: a browser reports what it can measure, so the three differ. A score from a
  // handful is a guess, and a guess is not shown.
  const n = [cur.lcp_n ?? cur.samples, cur.inp_n ?? cur.samples, cur.cls_n ?? cur.samples]
  const kc = (i: 0 | 1 | 2, icon: string, label: string, abbr: string): Xkc => {
    if (have[i] == null) return { icon, label, val: '–', tag: abbr, tone: '', detail: copy.nothingMeasured }
    if (n[i] < MIN_VITALS) return { icon, label, val: '–', tag: abbr, tone: '', detail: copy.fewVisits(n[i], MIN_VITALS) }
    const g = gradeOf(i, now[i])
    const usual = was && prev && [prev.lcp_ms, prev.inp_ms, prev.cls_1k][i] != null ? `${copy.usual} ${written(i, was[i])} · ` : ''
    return { icon, label, val: written(i, now[i]), tag: abbr, tone: g === 'good' ? '' : 'dn', detail: `${usual}${copy.grades[g]}` }
  }
  const pages: SlowPage[] = (cur.pages ?? [])
    .toSorted((a, b) => b.visitors - a.visitors)
    .slice(0, 8)
    .map((p) => ({ name: p.value, v: p.visitors, val: written(0, p.visitors / 1000), grade: gradeOf(0, p.visitors / 1000) }))
  const devices: SlowPage[] = (cur.devices ?? []).flatMap((d) => (d.lcp_ms == null || d.n < MIN_VITALS ? [] : [{ name: d.value, v: d.lcp_ms, val: written(0, d.lcp_ms / 1000), grade: gradeOf(0, d.lcp_ms / 1000) }]))
  return { kcs: [kc(0, 'speed', copy.loadingWord, copy.lcp), kc(1, 'click', copy.response, copy.inp), kc(2, 'goal', copy.stability, copy.cls)], pages, devices }
}

// ---- mentions, bots, links ----

/** One line per robot: the report keeps a robot's errands (training, answering) apart, and the list says its name once with every hit. */
export function mapBots(r: CrawlerReport): Bot[] {
  const by = new Map<string, number>()
  for (const s of r.series ?? []) by.set(s.name, (by.get(s.name) ?? 0) + s.total)
  return [...by].map(([name, count]) => ({ name, count })).filter((b) => b.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function mapLinks(rows: { key: string; value: string; visitors: number }[]): Row[] {
  return rows
    .filter((r) => r.key === 'url' && r.value)
    .map((r) => ({ val: r.value, name: r.value, v: r.visitors, c: r.visitors, st: '' as const }))
    .sort((a, b) => b.v - a.v)
}

/** The two sites we name; anything else is named by its own host. */
const SOURCES: Record<string, string> = { hn: copy.sourceNames.hn, ph: copy.sourceNames.ph }

/** The time of a mention in the site's own day: just the clock today, the day and the clock before. */
function whenOf(unix: number, tz: string, today: string): string {
  const parts = dateFmt('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(unix * 1000))
  const at = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const day = `${at('year')}-${at('month')}-${at('day')}`
  const clock = `${at('hour')}:${at('minute')}`
  return `${day === today ? copy.todayAt : fmtDay(day)} ${clock}`
}

export function mapMentions(list: ApiMention[], tz: string, today: string): Mention[] {
  return list
    .filter((m) => m.kind !== 'comment')
    .toSorted((a, b) => b.posted_at - a.posted_at)
    .map((m) => ({ title: m.title, src: SOURCES[m.source] ?? m.host, pts: m.points ?? null, cm: m.comments ?? null, when: whenOf(m.posted_at, tz, today) }))
}
