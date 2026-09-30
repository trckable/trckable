// A figure in the main chart's hover card: what it is, the number large in
// the text colour (the swatch carries the series colour), and under it how
// many sales made it, or how it compares. With no sales, it says so instead
// of a zero.
import type { ReactNode } from 'react'
import { timeCopy } from './copy'
import { bucketLabel } from './timeScale'
import type { Bucket } from '../lib/api'

export function Hero({ label, color, big, note, children }: { label: string; color: string; big: string | null; note?: string | null; children?: ReactNode }) {
  return (
    <div className="ct-hero">
      <span className="ct-label">
        <i style={{ background: color }} />
        {label}
      </span>
      {big === null ? <span className="ct-none">{timeCopy.noSales}</span> : <span className="ct-big num">{big}</span>}
      {note && <span className="ct-vs num">{note}</span>}
      {children}
    </div>
  )
}

/** How a bucket compares with the one it is set against. */
export function Versus({ a, b, fmt, when, bucket }: { a: number; b: number; fmt: (n: number) => string; when?: string; bucket: Bucket }) {
  const pct = b ? Math.round(((a - b) / b) * 100) : null
  return (
    <span className="ct-vs num">
      {pct !== null && <em className={pct >= 0 ? 'tone-up' : 'tone-down'}>{`${pct >= 0 ? '↑ ' : '↓ '}${Math.abs(pct)}%`}</em>} vs {fmt(b)}
      {when ? ` on ${bucketLabel(when, bucket, true)}` : ''}
    </span>
  )
}
