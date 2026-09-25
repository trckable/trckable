// Ranked rows, each with a thin proportional line under its name. Rows are
// buttons: click to filter the whole dashboard; hover (on sources) previews
// the money trail. The line used to be a block behind the whole row, so the
// numbers sat half on it and half off — the list read as noise.
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useTween } from '../lib/motion'
import { fmtInt, fmtPct } from '../lib/format'

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

  // Rows that change places slide there instead of jumping — which is what
  // turns a replay into a race. Each row remembers where it was, and after a
  // render is moved back there and let go (FLIP), so nobody loses their place
  // in a list that just reordered under them.
  const rows = useRef(new Map<string, HTMLElement>())
  const was = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const now = new Map<string, number>()
    for (const [key, el] of rows.current) now.set(key, el.offsetTop)
    if (!reduced) {
      for (const [key, el] of rows.current) {
        const last = was.current.get(key)
        const after = now.get(key)!
        if (last === undefined) continue
        // A row still sliding from the last change starts from where it is
        // on screen, not from where it was headed.
        const before = last + new DOMMatrixReadOnly(getComputedStyle(el).transform).m42
        if (Math.abs(before - after) < 0.5) continue
        el.style.transition = 'none'
        el.style.transform = `translateY(${before - after}px)`
        void el.offsetHeight // commit the start position before letting go
        el.style.transition = 'transform 0.42s var(--ease)'
        el.style.transform = ''
      }
    }
    was.current = now
  })
  if (p.loading)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 28, width: `${90 - i * 14}%` }} />
        ))}
      </div>
    )
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
          ref={(el) => {
            if (el) rows.current.set(it.key, el)
            else rows.current.delete(it.key)
          }}
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

/** A row's number counts to its new value with its bar, instead of jumping,
 *  so during a replay the figures climb as the rows race. */
function Count({ value, fmt = fmtInt }: { value: number; fmt?: (n: number) => string }) {
  return <>{fmt(Math.round(useTween(value, 420)))}</>
}
