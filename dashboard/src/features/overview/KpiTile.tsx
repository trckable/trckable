// One key number: its name, the number, and its change against the period
// before as a small chip (arrow, sign and colour, so it reads without the
// colour; "new" when there was nothing before). Its line, day by day, sits
// at its foot. The charted one is lit: a slim accent bar and a lifted surface.
import type { LucideIcon } from 'lucide-react'
import type { Delta } from '../../lib/format'
import { useTween } from '../../lib/motion'
import { copy } from './copy'
import './Overview.css'

interface Props {
  label: string
  icon: LucideIcon
  /** The number bucket by bucket, drawn small at the foot of the tile. */
  spark?: number[]
  value?: number
  fmt: (n: number) => string
  d: Delta | null
  /** The comparison in words, as the period picker says it. */
  vs: string
  pressed?: boolean
  onClick?: () => void
  money?: boolean
  loading?: boolean
}

export function KpiTile(p: Props) {
  const v = useTween(p.value ?? 0, 600)
  const cls = 'kpi' + (p.money ? ' money' : '')
  const body = (
    <>
      <div className="label">
        <span className={'kpi-icon' + (p.money ? ' money' : '')} aria-hidden="true">
          <p.icon size={17} strokeWidth={1.75} />
        </span>
        <span className="kpi-name" title={p.label}>
          {p.label}
        </span>
      </div>
      {/* The skeleton is decorative: the loading bar at the top of the page
          is the one thing that announces loading, and it says it once. */}
      {p.loading ? (
        <div className="value skeleton" style={{ width: '62%', height: 26, borderRadius: 7 }} aria-hidden="true" />
      ) : (
        <div className="kpi-row">
          <span className="value num">{p.value === undefined ? '–' : p.fmt(v)}</span>
          {p.d && <Change d={p.d} vs={p.vs} />}
        </div>
      )}
      {p.spark && !p.loading && <KpiSpark values={p.spark} />}
    </>
  )
  if (!p.onClick) return <div className={cls}>{body}</div>
  return (
    <button type="button" className={cls} aria-pressed={p.pressed} onClick={p.onClick} title={copy.chartTile(p.label)}>
      {body}
    </button>
  )
}

function Change({ d, vs }: { d: Delta; vs: string }) {
  const label = d.label === 'new' ? copy.newLabel(vs) : copy.change(d.label, vs)
  return (
    <span className={`kpi-delta num tone-${d.tone}`} title={label}>
      <span aria-hidden="true">{d.text}</span>
      <span className="sr">{label}</span>
    </span>
  )
}

/** A tile's small line: its number bucket by bucket, no axis, no labels —
 *  the shape of the period at a glance. */
function KpiSpark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="kpi-spark" aria-hidden="true" />
  const w = 120
  const h = 28
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line}L${w} ${h}L0 ${h}Z`} fill="currentColor" opacity="0.1" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
