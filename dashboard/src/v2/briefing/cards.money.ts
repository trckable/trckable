// The cards that come from outside the visits: what was sold, what Google sent, and a page people got stuck on. Each
// reads real answers (the payments, Search Console, the page's heatmap) and says nothing without them. Pure: cards.money.test.ts.
import type { Money, SearchRow } from '../../lib/api'
import type { Buyer } from '../../features/extras/extrasApi'
import { fmtInt, fmtFixed } from '../../lib/format'
import { copy } from './cards.copy'
import type { Story } from './cards'
import { sourceName } from './model'
import type { SearchStory, Stuck } from './useExtras'
import { bandFromBefore, judge, type Band } from './usual'

export interface SalesIn {
  money: Money
  buyers: Buyer[]
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

function who(buyers: Buyer[], money: Money): string {
  const nNew = buyers.length >= money.payments ? buyers.filter((b) => b.kind === 'new').length : money.customers
  const nUp = buyers.filter((b) => b.kind === 'upgrade').length
  const nRen = buyers.filter((b) => b.kind === 'renewal').length
  const parts = [nNew ? copy.becameCustomers(nNew) : '', nUp ? copy.upgraded(nUp) : '', nRen ? copy.renewals(nRen) : ''].filter(Boolean)
  return parts.length ? parts.join(', ') : copy.becameCustomers(money.payments)
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
      rest: copy.refundedRest(fmt(money.refunds)),
      vis: null,
      why: copy.refundWhy,
      val: fmt(money.refunds),
      m: money.refunds,
      u: '',
      how: copy.refundHow,
      ev: copy.refundEv(fmt(money.refunds)),
      deeper: { kind: 'table', tab: 'sales' },
    })
  }
  if (money.payments > 0) {
    const total = money.revenue + money.refunds
    const rows = buyers.slice(0, 4).map((b) => ({ l: `${kindWord(b.kind)}${b.referrer ? copy.via(sourceName(b.referrer)) : ''}`, t: i.clock(b.at), a: `+${fmt(b.amount)}`, flag: '' }))
    const extra = buyers.length > 4 ? [{ l: copy.more(buyers.length - 4), more: true }] : []
    const bySource = new Map<string, number>()
    buyers.forEach((b) => b.referrer && bySource.set(b.referrer, (bySource.get(b.referrer) ?? 0) + 1))
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0]
    out.push({
      key: 'sales',
      score: st === 'up' ? 72 : 62,
      head: who(buyers, money),
      rest: copy.paidIn(fmt(total)),
      vis: { k: 'rcpt', rows: [...rows, ...extra, { l: copy.rowIn, t: '', a: fmt(total), flag: '', tot: true }] },
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
  return out
}

export interface SearchIn {
  story: SearchStory
  domain: string
  rule: string
}

const pct1 = (x: number) => `${fmtFixed(x * 100, x > 0 && x < 0.1 ? 1 : 0)}%`
/** A query that is new, or rose or fell against what it sent the period before: the mark by it. */
const mark = (r: SearchRow, was: SearchRow | undefined): { cls: 'up' | 'dn' | undefined; flag: string } => {
  if (!was) return { cls: 'up', flag: '+' }
  const b = bandFromBefore(was.clicks)
  const st = b ? judge(r.clicks, b) : ''
  if (st === 'up') return { cls: 'up', flag: '▲' }
  return st === 'dn' ? { cls: 'dn', flag: '▼' } : { cls: undefined, flag: '' }
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
  const list = [...rows]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 4)
    .map((r) => {
      const m = mark(r, was.get(r.key))
      return { l: `“${r.key}”`, t: copy.pos(fmtFixed(r.position, 1)), a: fmtInt(r.clicks), flag: m.flag, mark: m.cls }
    })
  const tot = { l: copy.clicksTot(fmtInt(cur.clicks), fmtInt(cur.impressions)), t: copy.ctr(pct1(cur.impressions ? cur.clicks / cur.impressions : 0)), a: fmtFixed(avgPos(rows), 1), flag: '', tot: true }
  const base = { key: 'search' as const, vis: { k: 'rcpt' as const, rows: [...list, tot] }, deeper: { kind: 'table' as const, tab: 'search' as const }, how: `${copy.searchKnow} ${i.rule}`, u: 'clicks' }
  if (fresh) {
    return { ...base, score: 74, head: copy.rankNew(fresh.key), rest: copy.onGoogle, why: copy.newWhy(copy.clicks(fresh.clicks), fmtFixed(fresh.position, 1)), val: 'new', m: fresh.clicks, ev: '', act: { k: 'set', t: copy.alertNewSearch, msg: copy.alertNewSearchMsg } }
  }
  if (!moved) return null
  const up = moved.st === 'up'
  const x = moved.b.c > 0.5 ? moved.r.clicks / moved.b.c : 0
  return {
    ...base,
    score: up ? 76 : 79,
    bad: !up,
    head: up ? copy.searchSent(moved.r.key, copy.clicks(moved.r.clicks)) : copy.searchLost(moved.r.key, copy.clicks(moved.r.clicks)),
    rest: `${copy.fromGoogle}${movedWords(up, x)}`,
    why: `${copy.usuallyClicks(fmtInt(Math.max(0, moved.b.lo)), fmtInt(moved.b.hi))}${copy.positionNow(fmtFixed(moved.r.position, 1), fmtFixed(moved.w.position, 1))}`,
    val: fmtInt(moved.r.clicks),
    m: moved.r.clicks,
    ev: copy.searchEv(fmtInt(moved.r.clicks), fmtInt(Math.max(0, moved.b.lo)), fmtInt(moved.b.hi)),
    act: up ? { k: 'copy', t: copy.copyContent, text: copy.contentPrompt(i.domain, moved.r.key, fmtFixed(moved.r.position, 1)), done: copy.contentCopied } : { k: 'set', t: copy.setAlert, msg: copy.alertLeaves(moved.r.key) },
  }
}

/** How the move is put: how many times the usual, nothing for a small rise, far below for a fall. */
function movedWords(up: boolean, x: number): string {
  if (!up) return copy.farBelow
  return x >= 1.5 ? copy.yourUsual(`${fmtFixed(x, 1)}×`) : ''
}

const avgPos = (rows: SearchRow[]): number => {
  const w = rows.reduce((n, r) => n + r.clicks, 0)
  return w ? rows.reduce((n, r) => n + r.position * r.clicks, 0) / w : 0
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
