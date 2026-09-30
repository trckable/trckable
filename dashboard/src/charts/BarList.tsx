// Ranked rows, each with a thin proportional line under its name. Rows are
// buttons: click to filter the whole dashboard; hover (on sources) previews
// the money trail. The line used to be a block behind the whole row, so the
// numbers sat half on it and half off — the list read as noise.
import type { ReactNode } from 'react'
import { useTween } from '../lib/motion'
import { fmtInt, fmtPct } from '../lib/format'
import { Loading } from '../components/loading/Loading'

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
  total?: number
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

  if (p.loading)
    return <Loading height={164} />
  return (
    <div className="bl">
      <div className="cols">
        <span>{p.dimLabel}</span>
        <span style={{ width: 60, textAlign: 'right' }}>{p.valueLabel ?? 'Visitors'}</span>
        {p.subLabel && (
          <span className="sub" style={{ width: 52, textAlign: 'right' }}>
            {p.subLabel}
          </span>
        )}
        {p.money && <span style={{ width: 72, textAlign: 'right' }}>Revenue</span>}
      </div>
      {p.items.length === 0 && <div className="empty">{p.emptyText ?? 'Nothing here yet… peekaboo.'}</div>}
      {p.items.map((it) => (
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
          <span className="bl-label">
            <span className="bl-name">
              {it.color && <span className="dot" style={{ background: it.color }} />}
              <span className="bl-text">{it.label}</span>
            </span>
            <span className="bl-track" aria-hidden="true">
              <span className="bl-bar" style={{ width: `${(measure(it) / max) * 100}%`, background: it.color ?? p.barColor }} />
            </span>
          </span>
          <span className="bl-val num">
            <Count value={it.value} fmt={p.fmtValue} />
          </span>
          {p.subLabel && <span className="bl-val sub num">{it.sub !== undefined ? fmtPct(it.sub) : ''}</span>}
          {p.money && (
            <span className="bl-val num" style={{ width: 72, color: it.rev ? 'var(--text)' : 'var(--text-3)' }}>
              {it.rev ? p.money(it.rev) : '–'}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/** A row's number settles on its new value in about a tenth of a second,
 *  with its bar, instead of jumping. */
function Count({ value, fmt = fmtInt }: { value: number; fmt?: (n: number) => string }) {
  return <>{fmt(Math.round(useTween(value, 120)))}</>
}
