// The pictures on the answer cards: drawn in CSS and SVG, no chart library, so
// they cost nothing on first load. Each says its answer without a sentence; the
// sentence is in the card's tooltip.
import { Check } from 'lucide-react'
import { copy } from './copy'
import type { Viz as VizOf } from './rules'

const share = (n: number) => `${Math.round(n * 100)}%`

function Bars({ now, was }: { now: number; was?: number }) {
  const top = Math.max(now, was ?? 0, 1)
  const bar = (v: number, cls: string) => <i className={cls} style={{ height: `${Math.max(4, (v / top) * 100)}%` }} />
  return (
    <span className="sv-bars" role="img" aria-label={was === undefined ? String(now) : `${was} → ${now}`}>
      {was !== undefined && bar(was, 'was')}
      {bar(now, 'now')}
    </span>
  )
}

function Pages({ rows }: { rows: { name: string; share: number }[] }) {
  return (
    <ul className="sv-pages">
      {rows.map((r) => (
        <li key={r.name} title={`${r.name} ${share(r.share)}`}>
          <span className="sv-pages-name">{r.name}</span>
          <span className="sv-pages-bar">
            <i style={{ width: share(r.share) }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function Sources({ rows }: { rows: { name: string; share: number; color: string }[] }) {
  return (
    <div className="sv-sources">
      <span className={`sv-stack${rows.length ? '' : ' muted'}`} role="img" aria-label={rows.map((r) => `${r.name} ${share(r.share)}`).join(', ')}>
        {rows.map((r) => (
          <i key={r.name} style={{ width: share(r.share), background: r.color }} />
        ))}
      </span>
      {rows.length > 0 && (
        <ul className="sv-legend">
          {rows.map((r) => (
            <li key={r.name}>
              <i style={{ background: r.color }} />
              {r.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Fix({ count, name }: { count: number; name?: string }) {
  if (count < 0) return <span className="sv-fix off"><Check size={22} strokeWidth={2.4} /></span>
  if (count === 0)
    return (
      <span className="sv-fix good">
        <Check size={22} strokeWidth={2.4} />
        {copy.allGood}
      </span>
    )
  return (
    <span className="sv-fix bad">
      <b className="num">{count}</b>
      {name}
    </span>
  )
}

/** A half ring in red, amber and green with a needle; without a level it is grey. */
function Gauge({ level }: { level?: number }) {
  const a = Math.PI * (1 - (level ?? 0.5))
  const x = 60 + 38 * Math.cos(a)
  const y = 62 - 38 * Math.sin(a)
  const arc = (from: number, to: number, c: string) => {
    const p = (t: number) => `${60 + 48 * Math.cos(Math.PI * (1 - t))} ${62 - 48 * Math.sin(Math.PI * (1 - t))}`
    return <path d={`M ${p(from)} A 48 48 0 0 1 ${p(to)}`} stroke={level === undefined ? 'var(--border)' : c} />
  }
  return (
    <svg className="sv-gauge" viewBox="0 0 120 70" role="img" aria-label={level === undefined ? '–' : share(level)}>
      <g fill="none" strokeWidth="10">
        {arc(0.005, 0.33, 'var(--down)')}
        {arc(0.34, 0.66, 'var(--warn)')}
        {arc(0.67, 0.995, 'var(--up)')}
      </g>
      {level !== undefined && (
        <>
          <line x1="60" y1="62" x2={x} y2={y} stroke="var(--text)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="60" cy="62" r="4" fill="var(--text)" />
        </>
      )}
    </svg>
  )
}

export function Viz({ viz }: { viz: VizOf }) {
  if (viz.kind === 'bars') return <Bars now={viz.now} was={viz.was} />
  if (viz.kind === 'pages') return <Pages rows={viz.rows} />
  if (viz.kind === 'sources') return <Sources rows={viz.rows} />
  if (viz.kind === 'fix') return <Fix count={viz.count} name={viz.name} />
  return <Gauge level={viz.level} />
}
