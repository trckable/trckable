// Ranked rows: a hairline under each name that grows with its share, the
// numbers in mono, how each row moved against the period before, and on hover
// its share of the whole. Rows are buttons: click to filter the whole
// dashboard; hover (on sources) previews the money trail.
import type { ReactNode } from 'react'
import { useTween } from '../lib/motion'
import { fmtInt, fmtPct } from '../lib/format'
import { Loading } from '../components/loading/Loading'
import { moveOf, shareOf } from './change'
import { kitCopy } from './copy'

export interface BarItem {
  key: string
  label: ReactNode
  title?: string
  value: number
  sub?: number // e.g. bounce rate in Full mode
  rev?: number // revenue, minor units
  color?: string
  dim?: boolean
}

export function BarList(p: {
  items: BarItem[]
  /** The whole the rows are shares of (visitors); the rows' own sum when absent. */
  whole?: number
  /** What a row's number was in the period before (undefined: not there). */
  prior?: (key: string) => number | undefined
  dimLabel: string
  valueLabel?: string
  /** How the value column reads; counts by default. */
  fmtValue?: (n: number) => string
  subLabel?: string
  loading?: boolean
  emptyText?: string
  onPick?: (key: string) => void
  onHover?: (key: string | null) => void
  pickLabel?: (key: string) => string
  barColor?: string
  money?: (minor: number) => string // shows a Revenue column
  byRevenue?: boolean // bars measure revenue (Top earners)
}) {
  const measure = (i: BarItem) => (p.byRevenue ? (i.rev ?? 0) : i.value)
  const max = Math.max(1, ...p.items.map(measure))
  const whole = p.whole ?? p.items.reduce((sum, i) => sum + i.value, 0)

  if (p.loading) return <Loading height={164} />
  return (
    <div className="bl">
      <div className="bl-cols">
        <span>{p.dimLabel}</span>
        <span className="bl-val">{p.valueLabel ?? kitCopy.visitors}</span>
        <span className="bl-tail" />
        {p.subLabel && <span className="bl-sub">{p.subLabel}</span>}
        {p.money && <span className="bl-rev">{kitCopy.revenue}</span>}
      </div>
      {p.items.length === 0 && <div className="empty">{p.emptyText ?? 'Nothing here yet… peekaboo.'}</div>}
      {p.items.map((it) => {
        const share = shareOf(it.value, whole)
        return (
          <button
            key={it.key}
            type="button"
            className="bl-row"
            style={{ opacity: it.dim ? 0.38 : 1 }}
            title={it.title}
            aria-label={p.pickLabel?.(it.key) ?? `${it.title ?? it.key}: ${fmtInt(it.value)}. Filter by this`}
            onClick={() => p.onPick?.(it.key)}
            onMouseEnter={() => p.onHover?.(it.key)}
            onMouseLeave={() => p.onHover?.(null)}
            onFocus={() => p.onHover?.(it.key)}
            onBlur={() => p.onHover?.(null)}
          >
            <span className="bl-main">
              <span className="bl-name">
                {it.color && <span className="dot" style={{ background: it.color }} />}
                <span className="bl-text">{it.label}</span>
              </span>
              <span className="bl-line" aria-hidden="true">
                <i style={{ width: `${(measure(it) / max) * 100}%`, background: it.color ?? p.barColor }} />
              </span>
            </span>
            <span className="bl-val num">
              <Count value={it.value} fmt={p.fmtValue} />
            </span>
            <span className="bl-tail">
              <Change now={it.value} was={p.prior?.(it.key)} />
              <span className="bl-share num">{fmtPct(share)}</span>
            </span>
            {p.subLabel && <span className="bl-sub num">{it.sub !== undefined ? fmtPct(it.sub) : ''}</span>}
            {p.money && <span className={it.rev ? 'bl-rev num' : 'bl-rev num none'}>{it.rev ? p.money(it.rev) : '–'}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** ▲ 12% or ▼ 8% against the period before; nothing when there is nothing to compare with. */
function Change({ now, was }: { now: number; was: number | undefined }) {
  const m = moveOf(now, was)
  if (!m) return <span className="bl-chg num" aria-hidden="true" />
  if (m.dir === 'flat') return <span className="bl-chg num">{kitCopy.flat}</span>
  return (
    <span className={`bl-chg num ${m.dir}`} title={`${m.dir === 'down' ? '−' : '+'}${m.pct}%`}>
      {`${m.dir === 'up' ? kitCopy.up : kitCopy.down} ${m.pct}%`}
    </span>
  )
}

/** A row's number settles on its new value in about a tenth of a second,
 *  with its bar, instead of jumping. */
function Count({ value, fmt = fmtInt }: { value: number; fmt?: (n: number) => string }) {
  return <>{fmt(Math.round(useTween(value, 120)))}</>
}
