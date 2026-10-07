// Ranked rows: a hairline under each name that grows with its share, the
// numbers in mono, how each row moved against the period before, and on hover
// its share of the whole. Rows are buttons: click to filter the whole
// dashboard; hover (on sources) previews the money trail.
import type { ReactNode } from 'react'
import { useTween } from '../lib/motion'
import { fmtInt, fmtPct } from '../lib/format'
import { Loading } from '../components/loading/Loading'
import { shareOf } from './change'
import { DeltaPill } from './DeltaPill'
import { SPARK_H, SPARK_W, sparkPoints } from './sparkPath'
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
  /** What the ▲ / ▼ is measured on when it is not the value (revenue, for a list of customers). */
  moved?: { now: number; was: number | undefined }
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
  /** How the sub column reads; a share by default. */
  fmtSub?: (n: number) => string
  loading?: boolean
  emptyText?: string
  /** Instead of the plain line: a list that has to be started (EmptyState). */
  emptyState?: ReactNode
  onPick?: (key: string) => void
  onHover?: (key: string | null) => void
  pickLabel?: (key: string) => string
  barColor?: string
  money?: (minor: number) => string // shows a Revenue column
  byRevenue?: boolean // bars measure revenue (Top earners)
  /** A small chart for each row (its key → a value per day). A list that is given it keeps the column while the charts load. */
  spark?: Record<string, number[]>
  /** A button at the end of every row, shown on hover or focus: a way into something about that row, apart from the row's own click. */
  action?: { icon: ReactNode; label: (key: string) => string; onAct: (key: string) => void }
}) {
  const measure = (i: BarItem) => (p.byRevenue ? (i.rev ?? 0) : i.value)
  const max = Math.max(1, ...p.items.map(measure))
  const whole = p.whole ?? p.items.reduce((sum, i) => sum + i.value, 0)

  if (p.loading) return <Loading height={164} />
  return (
    <div className={'bl' + (p.money ? ' has-rev' : '') + (p.fmtSub ? ' wide-sub' : '') + (p.action ? ' has-act' : '')}>
      <div className="bl-cols">
        <span>{p.dimLabel}</span>
        {p.spark && <span className="bl-spark" aria-hidden="true" />}
        <span className="bl-val">{p.valueLabel ?? kitCopy.visitors}</span>
        <span className="bl-tail" />
        {p.subLabel && <span className="bl-sub">{p.subLabel}</span>}
        {p.money && <span className="bl-rev">{kitCopy.revenue}</span>}
      </div>
      {p.items.length === 0 && (p.emptyState ?? <div className="empty">{p.emptyText ?? 'Nothing here yet… peekaboo.'}</div>)}
      {p.items.map((it) => {
        const share = shareOf(it.value, whole)
        const row = (
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
              <span className="kit-rowbar bl-line" aria-hidden="true">
                <i style={{ width: `${(measure(it) / max) * 100}%`, background: it.color ?? p.barColor }} />
              </span>
            </span>
            {p.spark && <Spark values={p.spark[it.key]} />}
            <span className="bl-val num">
              <Count value={it.value} fmt={p.fmtValue} />
            </span>
            <span className="bl-tail">
              <DeltaPill now={it.moved?.now ?? it.value} was={it.moved ? it.moved.was : p.prior?.(it.key)} />
              <span className="bl-share num">{fmtPct(share)}</span>
            </span>
            {p.subLabel && <span className="bl-sub num">{it.sub !== undefined ? (p.fmtSub ?? fmtPct)(it.sub) : ''}</span>}
            {p.money && <span className={it.rev ? 'bl-rev num' : 'bl-rev num none'}>{it.rev ? p.money(it.rev) : '–'}</span>}
          </button>
        )
        if (!p.action) return row
        const label = p.action.label(it.key)
        return (
          <div key={it.key} className="bl-item">
            {row}
            <button type="button" className="bl-act" aria-label={label} title={label} onClick={() => p.action?.onAct(it.key)}>
              {p.action.icon}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** A row's number settles on its new value in about a tenth of a second,
 *  with its bar, instead of jumping. */
function Count({ value, fmt = fmtInt }: { value: number; fmt?: (n: number) => string }) {
  return <>{fmt(Math.round(useTween(value, 120)))}</>
}

/** The row's last days as a line; the room is kept while they are on their way. */
function Spark({ values }: { values?: number[] }) {
  const pts = values ? sparkPoints(values) : ''
  return (
    <span className="bl-spark" aria-hidden="true">
      {pts && (
        <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}>
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}
