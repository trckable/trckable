// The cards that come from outside the visits: what was sold, what Google sent, and a page people got stuck on. Each
// reads real answers (the payments, Search Console, the page's heatmap) and says nothing without them. Pure: cards.money.test.ts.
import type { Money, SearchRow } from '../../lib/api'
import type { Buyer, Refunds } from '../../features/extras/extrasApi'
import { countryName, fmtInt, fmtFixed } from '../../lib/format'
import { copy } from './cards.copy'
import type { Story, Vis } from './cards'
import { sourceName } from './model'
import type { FirstFrom, FunnelStory, SearchStory, Stuck } from './useExtras'
import { bandFromBefore, judge, type Band } from './usual'

export interface SalesIn {
  money: Money
  buyers: Buyer[]
  /** The payments paid back in the period, newest first, with the count over 90 days; none when it could not be read. */
  refunds?: Refunds | null
  /** What the period's sales are told against; none without the history. */
  band: Band | null
  fmt: (minor: number) => string
  /** A time as the site's clock says it ("16:05"). */
  clock: (iso: string) => string
  today: boolean
  rule: string
}

const KIND: Record<string, string> = { upgrade: copy.upgrade, renewal: copy.renewal }
const kindWord = (k: string) => KIND[k] ?? copy.newCustomer
/** The payment providers say "one_time" or "subscription" for a first payment: a buyer is new unless the sale moved a plan or renewed one. */
const isNew = (b: Buyer) => b.kind !== 'upgrade' && b.kind !== 'renewal'

/** The sales list holds new customers and upgrades only (the server leaves renewals out) and at most this many. */
export const BUYERS_ASKED = 20

/** The payments of the period that the buyers list does not hold: its renewals, with what they came to. None when the list was cut short. */
export function unlisted(buyers: Buyer[], money: Money): { n: number; net: number } {
  if (buyers.length >= BUYERS_ASKED) return { n: 0, net: 0 }
  const n = Math.max(0, money.payments - buyers.length)
  return { n, net: n ? money.revenue - buyers.reduce((a, b) => a + b.amount, 0) : 0 }
}

function who(buyers: Buyer[], money: Money): string {
  const rest = unlisted(buyers, money).n
  const nNew = buyers.length >= money.payments || buyers.length < BUYERS_ASKED ? buyers.filter(isNew).length : money.customers
  const nUp = buyers.filter((b) => b.kind === 'upgrade').length
  const nRen = buyers.filter((b) => b.kind === 'renewal').length + rest
  const parts = [nNew ? copy.becameCustomers(nNew) : '', nUp ? copy.upgraded(nUp) : '', nRen ? copy.renewals(nRen) : ''].filter(Boolean)
  return parts.length ? parts.join(', ') : copy.becameCustomers(money.payments)
}

/** The receipt of the refunds: one line each (the sale it undoes, when, how much went back) and what the period gave back in all. */
function refundVis(i: SalesIn): Story['vis'] {
  const r = i.refunds
  if (!r || r.refunds.length === 0) return null
  const rows = r.refunds.slice(0, 4).map((x) => ({ l: copy.refundRow(kindWord(x.kind)), t: i.clock(x.at), a: x.amount > 0 ? `-${i.fmt(x.amount)}` : `+${i.fmt(-x.amount)}`, flag: x.country ?? '', neg: true }))
  const extra = r.count > rows.length ? [{ l: copy.more(r.count - rows.length), more: true }] : []
  return { k: 'rcpt', rows: [...rows, ...extra, { l: copy.refundTot, t: '', a: `-${i.fmt(r.amount)}`, flag: '', neg: true, tot: true }] }
}

export function salesCards(i: SalesIn): Story[] {
  const { money, buyers, band, fmt } = i
  const out: Story[] = []
  const st = band ? judge(money.revenue, band) : ''
  const range = band ? copy.usualMoney(fmt(Math.max(0, band.lo)), fmt(band.hi), i.today) : ''
  if (money.refunds > 0) {
    out.push({
      key: 'sales',
      score: 92,
      bad: true,
      head: copy.refunded,
      ask: copy.askRefund(fmt(money.refunds)),
      rest: copy.refundedRest(fmt(money.refunds)),
      vis: refundVis(i),
      why: i.refunds && i.refunds.count_90d > i.refunds.count ? copy.refunds90(i.refunds.count_90d, i.refunds.count === 1) : copy.refundWhy,
      val: fmt(money.refunds),
      m: money.refunds,
      u: '',
      how: copy.refundHow,
      ev: copy.refundEv(fmt(money.refunds)),
      deeper: { kind: 'table', tab: 'sales' },
    })
  }
  if (money.payments > 0) {
    // The headline, the rows and the total are the same sales, net of what went back: the rows add up to the total.
    const total = money.revenue
    const rows = buyers.slice(0, 4).map((b) => ({ l: `${kindWord(b.kind)}${b.referrer ? copy.via(sourceName(b.referrer)) : ''}`, t: i.clock(b.at), a: `+${fmt(b.amount)}`, flag: b.country ?? '' }))
    const extra = buyers.length > 4 ? [{ l: copy.more(buyers.length - 4), more: true }] : []
    const un = unlisted(buyers, money)
    const renewed = un.n > 0 ? [{ l: copy.renewals(un.n), t: '', a: `+${fmt(un.net)}`, flag: '' }] : []
    const bySource = new Map<string, number>()
    buyers.forEach((b) => b.referrer && bySource.set(b.referrer, (bySource.get(b.referrer) ?? 0) + 1))
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0]
    out.push({
      key: 'sales',
      score: st === 'up' ? 72 : 62,
      head: who(buyers, money),
      ask: copy.askSold(fmt(total)),
      vis: { k: 'rcpt', rows: [...rows, ...extra, ...renewed, { l: copy.rowIn, t: '', a: fmt(total), flag: '', tot: true }] },
      why: `${range}${top ? copy.broughtOf(sourceName(top[0]), top[1], buyers.length) : ''}`.trim(),
      val: fmt(total),
      m: total,
      u: '',
      how: `${copy.salesHow} ${i.rule}`,
      ev: band ? copy.salesEv(fmt(money.revenue), fmt(Math.max(0, band.lo)), fmt(band.hi)) : '',
      act: { k: 'set', t: copy.alertSales, msg: copy.alertSalesMsg },
      deeper: { kind: 'table', tab: 'sales' },
    })
  } else if (band && st === 'dn') {
    out.push({
      key: 'sales',
      score: 70,
      bad: true,
      head: copy.noSales,
      ask: copy.askNoSales,
      rest: copy.noSalesRest(fmt(Math.max(0, band.lo)), fmt(band.hi), i.today),
      vis: { k: 'rcpt', rows: [{ l: copy.nothingThere, more: true }] },
      why: copy.salesBelow,
      val: fmt(0),
      m: 0,
      u: '',
      how: `${i.rule} ${copy.salesHow2}`,
      ev: copy.salesEv(fmt(0), fmt(Math.max(0, band.lo)), fmt(band.hi)),
      act: { k: 'set', t: copy.alertQuiet, msg: copy.alertQuietMsg },
      deeper: { kind: 'table', tab: 'sales' },
    })
  }
  // What was sold and what went back are one story: one card, the receipt of both, and the net.
  if (out.length === 2) return [soldAndBack(out[1], out[0], i)]
  return out
}

type Receipt = Extract<NonNullable<Story['vis']>, { k: 'rcpt' }>
const rowsOf = (s: Story, total: boolean): Receipt['rows'] => (s.vis?.k === 'rcpt' ? s.vis.rows.filter((r) => !r.tot || total) : [])

/** The sales card with the refunds in it: sold, refunded and what was kept, in one receipt. */
function soldAndBack(sold: Story, back: Story, i: SalesIn): Story {
  const { money, fmt } = i
  return {
    ...sold,
    score: back.score,
    bad: true,
    head: copy.soldGross(fmt(money.revenue + money.refunds)),
    ask: copy.askSoldBack(fmt(money.refunds)),
    rest: copy.soldBack(fmt(money.refunds), fmt(money.revenue)),
    // The listed sales are already net of what went back, so the rows add up to the net.
    vis: { k: 'rcpt', rows: [...rowsOf(sold, false), { l: copy.rowNet, t: '', a: fmt(money.revenue), flag: '', tot: true }] },
    why: `${sold.why} ${back.why}`.trim(),
    how: `${sold.how} ${back.how}`,
    ev: `${sold.ev} ${back.ev}`.trim(),
  }
}

interface SearchIn {
  story: SearchStory
  domain: string
  rule: string
}

/** The queries as a plain list of query, position and clicks: the one the card is about leads, then the most clicked. */
export function queryList(rows: SearchRow[], lead: string): Extract<Vis, { k: 'rcpt' }> {
  const first = rows.filter((r) => r.key === lead)
  const rest = rows.filter((r) => r.key !== lead).sort((a, b) => b.clicks - a.clicks)
  return {
    k: 'rcpt',
    plain: true,
    rows: [...first, ...rest].slice(0, 4).map((r, n) => ({ l: `“${r.key}”`, t: copy.pos(fmtFixed(r.position, 1)), a: fmtInt(r.clicks), lead: n === 0 })),
  }
}

/** One card about the searches: a query that is new, or the one that moved furthest from what it sent the period before. */
export function searchCard(i: SearchIn): Story | null {
  const { cur, prev } = i.story
  const rows = (cur.rows ?? []).filter((r) => r.clicks > 0)
  if (!rows.length || !prev) return null
  const was = new Map((prev.rows ?? []).map((r) => [r.key, r]))
  const fresh = rows.filter((r) => !was.has(r.key) && r.clicks >= 2).sort((a, b) => b.clicks - a.clicks)[0]
  const moved = rows
    .flatMap((r) => {
      const w = was.get(r.key)
      const b = w ? bandFromBefore(w.clicks) : null
      const st = b ? judge(r.clicks, b) : ''
      return b && st ? [{ r, w: w as SearchRow, b, st, d: Math.abs(r.clicks - b.c) }] : []
    })
    .sort((a, b) => b.d - a.d)[0]
  const base = { key: 'search' as const, deeper: { kind: 'table' as const, tab: 'search' as const }, how: `${copy.searchKnow} ${copy.searchRule}`, u: 'clicks' }
  if (fresh) {
    return { ...base, vis: queryList(rows, fresh.key), score: 74, head: copy.rankNew(fresh.key), ask: copy.askRank(fresh.key), rest: copy.onGoogle, why: copy.newWhy(copy.clicks(fresh.clicks), fmtFixed(fresh.position, 1)), val: 'new', m: fresh.clicks, ev: '', act: { k: 'set', t: copy.alertNewSearch, msg: copy.alertNewSearchMsg } }
  }
  if (!moved) return null
  const up = moved.st === 'up'
  const vis = queryList(rows, moved.r.key)
  const x = moved.b.c > 0.5 ? moved.r.clicks / moved.b.c : 0
  return {
    ...base,
    vis,
    score: up ? 76 : 79,
    bad: !up,
    head: up ? copy.searchSent(moved.r.key, copy.clicks(moved.r.clicks)) : copy.searchLost(moved.r.key, copy.clicks(moved.r.clicks)),
    ask: copy.askSearch(moved.r.key, up),
    rest: `${copy.fromGoogle}${searchMoved(up, x)}`,
    why: `${copy.searchWas(fmtInt(moved.w.clicks))}${copy.positionNow(fmtFixed(moved.r.position, 1), fmtFixed(moved.w.position, 1))}`,
    val: fmtInt(moved.r.clicks),
    m: moved.r.clicks,
    ev: copy.searchEv(fmtInt(moved.r.clicks), fmtInt(moved.w.clicks)),
    act: up ? { k: 'copy', t: copy.copyContent, text: copy.contentPrompt(i.domain, moved.r.key, fmtFixed(moved.r.position, 1)), done: copy.contentCopied } : { k: 'set', t: copy.setAlert, msg: copy.alertLeaves(moved.r.key) },
  }
}

/** How the move is put, against what Google sent the period before (Search Console has no usual of its own): how many times that, nothing for a small rise, far below for a fall. */
function searchMoved(up: boolean, x: number): string {
  if (!up) return copy.searchFarBelow
  return x >= 1.5 ? copy.searchTimes(`${fmtFixed(x, 1)}×`) : ''
}

/** A page where the same thing was pressed again and again: someone, somewhere, is stuck. */
export function stuckCard(s: Stuck, rule: string): Story {
  const rows = [{ l: copy.stuckLanded(s.page), t: '', a: '', flag: '' }, ...s.rage.slice(0, 3).map((r) => ({ l: copy.stuckClicked(r.el, r.n), t: '', a: '', flag: '' }))]
  const n = s.rage.reduce((a, r) => a + r.n, 0)
  return {
    key: 'peek',
    score: 61,
    head: copy.stuckOn(s.page),
    vis: { k: 'rcpt', rows },
    why: copy.stuckWhy,
    val: fmtInt(n),
    m: n,
    u: 'clicks',
    how: `${copy.stuckHow} ${rule}`,
    ev: copy.stuckEv(n, s.views),
    act: { k: 'x', t: copy.stuckAct },
    deeper: { kind: 'explore', filter: { dim: 'entry_page', value: s.page } },
  }
}

/** The leak card with the page people are stuck on named under its steps (what they pressed again and again). */
export function withStuck(leak: Story, s: Stuck): Story {
  const top = s.rage[0]
  return { ...leak, why: top ? `${leak.why} ${copy.leakStuck(s.page, top.el, top.n)}` : leak.why }
}

const pct0 = (x: number) => `${Math.round(x * 100)}%`

/** The signup path where fewer go on than usual: the steps as bars, the step that leaks in red, and what to ask an editor. */
export function leakCard(i: { f: FunnelStory; domain: string; rule: string }): Story | null {
  const { steps, leak, alt } = i.f
  if (leak.at < 1) return null
  const a = steps[leak.at - 1]
  const b = steps[leak.at]
  const usual = Math.round(a.v * leak.ur)
  // Too few people to say "usually" about.
  if (usual < 3) return null
  const rows = steps.map((s, k) => ({ name: s.name, v: s.v, w: Math.max(3, (s.v / (steps[0].v || 1)) * 100), hot: k === leak.at ? copy.leakGoOn(pct0(b.v / (a.v || 1)), pct0(leak.ur)) : '' }))
  return {
    key: 'funnel',
    score: 74,
    bad: true,
    head: copy.leakHead(fmtInt(b.v), fmtInt(a.v), a.name, b.name),
    rest: copy.leakRest(fmtInt(usual), fmtInt(a.v)),
    vis: { k: 'funnel', rows },
    why: alt ? copy.leakAlt(alt) : copy.leakUsualRange,
    val: pct0(leak.r),
    m: b.v,
    u: 'people',
    how: `${i.rule} ${copy.leakHow}`,
    ev: copy.leakEv(fmtInt(b.v), fmtInt(a.v), fmtInt(usual)),
    ask: copy.leakAsk(a.name, b.name),
    act: { k: 'copy', t: copy.fixPrompt, text: copy.leakPrompt(i.domain, pct0(leak.r), a.name, b.name, pct0(leak.ur), alt), done: copy.leakCopied },
    deeper: { kind: 'table', tab: 'funnels' },
  }
}

/** The first payment from a country nobody had paid from in the last 90 days. */
export function firstCard(i: { first: FirstFrom; band: Band | null; fmt: (minor: number) => string; clock: (iso: string) => string; rule: string }): Story {
  const { first: f, band } = i
  const name = countryName(f.country)
  const via = f.referrer ? sourceName(f.referrer) : copy.newCustomer.toLowerCase()
  return {
    key: 'countries',
    score: 68,
    head: copy.firstFrom(name),
    rest: '',
    vis: { k: 'journey', steps: [...(f.referrer ? [{ l: sourceName(f.referrer) }] : []), { l: name, flag: f.country }, { l: i.fmt(f.amount), t: `${copy.newCustomer} · ${i.clock(f.at)}` }] },
    why: copy.firstWhy(i.fmt(f.amount), via, i.clock(f.at), name, band ? `${fmtInt(Math.max(0, band.lo))}–${fmtInt(band.hi)}` : ''),
    val: '1st',
    m: 1,
    u: copy.firstUnit,
    how: copy.firstHow(name),
    ev: band ? `Now ${fmtInt(f.people)}, usual ${fmtInt(Math.max(0, band.lo))} to ${fmtInt(band.hi)}.` : '',
    act: { k: 'set', t: copy.firstAlert, msg: copy.firstAlertMsg(name) },
    deeper: { kind: 'explore', filter: { dim: 'country', value: f.country } },
    mark: copy.firstNote,
    kc: { flag: f.country, label: name },
  }
}
