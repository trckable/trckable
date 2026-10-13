// The lens of the All sites directions: the same page seen as Visitors, Revenue
// or Uptime, and the picker that narrows it to some sites. A lens changes the
// numbers on the page, never its layout.
import { Check, ChevronDown } from 'lucide-react'
import { Popover, Segmented } from '../kit'
import type { Site, SiteRow } from '../lib/api'
import { delta, fmtInt, fmtMoney, type Delta } from '../lib/format'
import { type Item } from './allNext'
import { next } from './allNextCopy'
import { revenueTrend, uptimeOf, type DayState } from './allDesignsFixture'
import '../components/sheet.css'

export type Lens = 'visitors' | 'revenue' | 'uptime'
export const LENSES: Lens[] = ['visitors', 'revenue', 'uptime']

export const lensFromUrl = (): Lens => {
  const l = new URLSearchParams(location.search).get('lens')
  return LENSES.find((x) => x === l) ?? 'visitors'
}

export function LensSwitch({ lens, onChange, money }: { lens: Lens; onChange: (l: Lens) => void; money: boolean }) {
  const label = { visitors: next.lensVisitors, revenue: next.lensRevenue, uptime: next.lensUptime }
  return <Segmented label={next.lensLabel} value={lens} onChange={onChange} options={LENSES.filter((l) => money || l !== 'revenue').map((l) => ({ value: l, label: label[l] }))} />
}

export function SitePicker({ sites, picked, onChange }: { sites: Site[]; picked: Set<string>; onChange: (s: Set<string>) => void }) {
  const all = picked.size === 0 || picked.size === sites.length
  const text = all ? next.pickAll : next.pickSome(picked.size, sites.length)
  const toggle = (id: string) => {
    const s = new Set(all ? sites.map((x) => x.id) : picked)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    onChange(s.size === sites.length ? new Set() : s)
  }
  return (
    <Popover
      label={next.pickLabel}
      className="menu"
      trigger={(p) => (
        <button type="button" className="btn ghost all-period" {...p} aria-haspopup="menu" aria-label={next.pickLabel}>
          {text}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
    >
      {() => (
        <div className="menu-list" role="menu" aria-label={next.pickLabel}>
          {sites.map((s) => {
            const on = all || picked.has(s.id)
            return (
              <button key={s.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(s.id)}>
                {s.name || s.domain}
                {on && <Check size={14} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )
}

const STATE_LABEL: Record<DayState, string> = { ok: next.dayOk, quiet: next.dayQuiet, down: next.dayDown, none: next.dayNone }

/** A status-page strip: a bar per day, green ok, amber quiet, red down. */
export function UptimeStrip({ days }: { days: DayState[] }) {
  return (
    <span className="nx-up" role="img" aria-label={next.stripLabel}>
      {days.map((s, i) => (
        <i key={i} className={s} title={STATE_LABEL[s]} />
      ))}
    </span>
  )
}

/** What one site shows under the lens: the number, its move, a line, a note. */
export interface Cell {
  main: string
  unit: string
  delta: Delta | null
  series: number[] | null
  days: DayState[] | null
  note: string
  /** A short second figure for a table: the share, the downtime. */
  extra: string
}

const pct = (x: number) => (x >= 99.995 ? '100%' : x.toFixed(x >= 99 ? 2 : 1) + '%')
export const downText = (m: number) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`)

export function cellOf(lens: Lens, i: Item, totalRevenue: number): Cell {
  const r: SiteRow = i.row
  if (lens === 'revenue') {
    const t = revenueTrend(r)
    const has = r.revenue !== undefined && !r.error
    return {
      main: has ? fmtMoney(r.revenue ?? 0, r.currency, r.exponent, { cents: false }) : '–',
      unit: '',
      delta: t ? delta(r.revenue ?? 0, t.previous) : null,
      series: t?.series ?? null,
      days: null,
      note: has && totalRevenue > 0 ? next.shareOf(fmtInt(((r.revenue ?? 0) / totalRevenue) * 100)) : next.noPayments,
      extra: has && totalRevenue > 0 ? fmtInt(((r.revenue ?? 0) / totalRevenue) * 100) + '%' : '–',
    }
  }
  if (lens === 'uptime') {
    const u = uptimeOf(r, i.site)
    return { main: pct(u.pct), unit: next.incidentsN(u.incidents), delta: null, series: null, days: u.days, note: u.downMinutes ? next.downFor(downText(u.downMinutes)) : next.noDowntime, extra: u.downMinutes ? downText(u.downMinutes) : '–' }
  }
  return { main: fmtInt(i.today), unit: next.todayWord, delta: delta(r.visitors, r.previous_visitors), series: r.series, days: null, note: '', extra: '' }
}

/** The one line over the page for the Revenue and Uptime lenses. */
export function lensHeadline(lens: Lens, list: Item[], total: string): string {
  if (lens === 'revenue') {
    const lead = [...list].filter((i) => (i.row.revenue ?? 0) > 0).sort((a, b) => (b.row.revenue ?? 0) - (a.row.revenue ?? 0))[0]
    const paying = list.filter((i) => i.row.revenue !== undefined).length
    return next.revenueLine(total, paying, lead ? lead.row.name || lead.row.domain : '')
  }
  const ups = list.map((i) => uptimeOf(i.row, i.site))
  const mean = ups.length ? ups.reduce((a, u) => a + u.pct, 0) / ups.length : 100
  return next.uptimeLine(list.length, pct(mean), ups.reduce((a, u) => a + u.incidents, 0))
}

export const revenueTotal = (rows: SiteRow[]): number => rows.reduce((n, r) => n + (r.error ? 0 : (r.revenue ?? 0)), 0)

/** The three figures over the page for the Revenue and Uptime lenses. */
export function lensStrip(lens: 'revenue' | 'uptime', list: Item[], total: string): { label: string; value: string }[] {
  if (lens === 'revenue') {
    const sum = revenueTotal(list.map((i) => i.row))
    const top = [...list].sort((a, b) => (b.row.revenue ?? 0) - (a.row.revenue ?? 0))[0]
    return [
      { label: next.stripRevenue, value: total },
      { label: next.stripPaying, value: String(list.filter((i) => i.row.revenue !== undefined).length) },
      { label: next.stripTop, value: top && sum > 0 ? `${top.row.name || top.row.domain} · ${fmtInt(((top.row.revenue ?? 0) / sum) * 100)}%` : '–' },
    ]
  }
  const ups = list.map((i) => uptimeOf(i.row, i.site))
  const mean = ups.length ? ups.reduce((a, u) => a + u.pct, 0) / ups.length : 100
  return [
    { label: next.stripUptime, value: pct(mean) },
    { label: next.stripIncidents, value: String(ups.reduce((a, u) => a + u.incidents, 0)) },
    { label: next.stripDowntime, value: downText(ups.reduce((a, u) => a + u.downMinutes, 0)) },
  ]
}
