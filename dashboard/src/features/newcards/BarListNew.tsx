// The ranked lists in the new cards: a hairline under each row that grows with
// its share, the numbers in mono, how each row moved against the period before,
// and on hover its share of the whole. The same props as BarList, which hands
// over to this under ?cards=new.
import type { Result } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { useTween } from '../../lib/motion'
import { Loading } from '../../components/loading/Loading'
import type { BarListProps } from '../../charts/BarList'
import { DIM_LABEL, PLACE_LABEL } from '../overview/dimLabels'
import { basis } from './basis'
import { moveOf, shareOf } from './change'
import { newCopy } from './copy'
import './newcards.css'

/** The dimension a list's heading stands for. */
const dimOf = (label: string) => [...Object.entries(DIM_LABEL), ...Object.entries(PLACE_LABEL)].find(([, l]) => l === label)?.[0]

/** What the period before had on the row with this key, for the number the row shows. */
function before(prev: Result | undefined, p: BarListProps, key: string): number | undefined {
  const dim = dimOf(p.dimLabel)
  if (!prev || !dim) return p.dimLabel === 'Goal' ? prev?.goals?.find((r) => r.value === key)?.visitors : undefined
  if (p.byRevenue) return (prev.revenue_dims?.[dim] ?? []).find((r) => r.value === key)?.customers
  return (prev.dims[dim] ?? []).find((r) => r.value === key)?.visitors
}

function Change({ now, was }: { now: number; was: number | undefined }) {
  const m = moveOf(now, was)
  if (!m) return <span className="nl-chg num" aria-hidden="true" />
  const cls = m.dir === 'flat' ? 'nl-chg num' : `nl-chg num ${m.dir}`
  return (
    <span className={cls} title={`${m.dir === 'down' ? '−' : '+'}${m.pct}%`}>
      {m.dir === 'flat' ? newCopy.flat : `${m.dir === 'up' ? newCopy.up : newCopy.down} ${m.pct}%`}
    </span>
  )
}

function Count({ value, fmt = fmtInt }: { value: number; fmt?: (n: number) => string }) {
  return <>{fmt(Math.round(useTween(value, 420)))}</>
}

export default function BarListNew(p: BarListProps) {
  if (p.loading) return <Loading height={164} />
  const { current, previous } = basis()
  const measure = (i: { value: number; rev?: number }) => (p.byRevenue ? (i.rev ?? 0) : i.value)
  const max = Math.max(1, ...p.items.map(measure))
  const whole = p.byRevenue ? p.items.reduce((sum, i) => sum + i.value, 0) : (current?.kpis.visitors ?? 0)
  return (
    <div className="bl nl">
      <div className="nl-cols">
        <span>{p.dimLabel}</span>
        <span className="nl-val">{p.valueLabel ?? 'Visitors'}</span>
        <span className="nl-chg" />
        {p.subLabel && <span className="nl-sub">{p.subLabel}</span>}
        {p.money && <span className="nl-rev">{newCopy.revenue}</span>}
      </div>
      {p.items.length === 0 && <div className="empty">{p.emptyText ?? 'Nothing here yet… peekaboo.'}</div>}
      {p.items.map((it) => {
        const share = shareOf(it.value, whole)
        return (
          <button
            key={it.key}
            type="button"
            className="bl-row nl-row"
            style={{ opacity: it.dim ? 0.38 : 1 }}
            title={it.title}
            aria-label={p.pickLabel?.(it.key) ?? `${it.title ?? it.key}: ${fmtInt(it.value)}. Filter by this`}
            onClick={() => p.onPick?.(it.key)}
            onMouseEnter={() => p.onHover?.(it.key)}
            onMouseLeave={() => p.onHover?.(null)}
            onFocus={() => p.onHover?.(it.key)}
            onBlur={() => p.onHover?.(null)}
          >
            <span className="nl-main">
              <span className="nl-name">
                {it.color && <span className="dot" style={{ background: it.color }} />}
                <span className="bl-text">{it.label}</span>
              </span>
              <span className="nl-line" aria-hidden="true">
                <i style={{ width: `${(measure(it) / max) * 100}%`, background: it.color ?? p.barColor }} />
              </span>
            </span>
            <span className="nl-val num">
              <Count value={it.value} fmt={p.fmtValue} />
            </span>
            <span className="nl-tail">
              <Change now={it.value} was={before(previous, p, it.key)} />
              <span className="nl-share num">{`${(share * 100).toFixed(share > 0 && share < 0.1 ? 1 : 0)}%`}</span>
            </span>
            {p.subLabel && <span className="nl-sub num">{it.sub !== undefined ? `${(it.sub * 100).toFixed(it.sub > 0 && it.sub < 0.1 ? 1 : 0)}%` : ''}</span>}
            {p.money && <span className={it.rev ? 'nl-rev num' : 'nl-rev num none'}>{it.rev ? p.money(it.rev) : '–'}</span>}
          </button>
        )
      })}
    </div>
  )
}
