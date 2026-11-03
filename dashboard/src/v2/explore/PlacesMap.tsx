// A filled world map: each country shaded by its visitors in one lime scale, the name and the number on hover, a tap
// filters by it. The outlines are precomputed (lib/worldmap.ts), so it loads in its own chunk and fetches nothing.
import { useMemo, useState } from 'react'
import { countryName, fmtInt } from '../../lib/format'
import { COUNTRIES, MAP_W } from '../../lib/worldmap'
import { Flag } from '../ui/Flag'
import { copy } from './placesCopy'
import type { Row } from './types'
import './places.css'

/** A ring that crosses the antimeridian jumps from one edge of the map to the other: filled, that is a band across the whole world. Each side of the jump becomes a ring of its own. */
export function unwrap(d: string): string {
  return d
    .split('M')
    .filter(Boolean)
    .flatMap((ring) => {
      const pts = ring.replace(/Z$/, '').split('L')
      const cuts = pts.flatMap((p, i) => (i > 0 && Math.abs(Number(p.split(',')[0]) - Number(pts[i - 1].split(',')[0])) > MAP_W / 2 ? [i] : []))
      if (cuts.length === 0) return [ring]
      const parts = [...cuts, pts.length].map((end, i) => pts.slice(i === 0 ? 0 : cuts[i - 1], end))
      // The last piece runs on into the first: one ring around the edge.
      const last = parts.pop() as string[]
      parts[0] = [...last, ...parts[0]]
      return parts.map((p) => `${p.join('L')}Z`)
    })
    .map((r) => `M${r}`)
    .join('')
}

const OUTLINES = COUNTRIES.map(([code, d]) => [code, unwrap(d)] as const)

const EMPTY = 'color-mix(in srgb, var(--mk-text) 9%, transparent)'

export default function PlacesMap({ rows, onPick }: { rows: Row[]; onPick: (code: string) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const { by, peak } = useMemo(() => {
    const by = new Map(rows.filter((r) => r.code).map((r) => [(r.code as string).toUpperCase(), r.v]))
    return { by, peak: Math.max(0, ...by.values()) }
  }, [rows])
  // The square root keeps a country with a tenth of the traffic visible instead of nearly bare.
  const fill = (n: number | undefined) => (n && peak ? `color-mix(in srgb, var(--mk-lime) ${Math.round(18 + Math.sqrt(n / peak) * 82)}%, var(--mk-card2))` : EMPTY)
  const shown = hover ?? null
  return (
    <div className="xmap">
      <svg viewBox={`0 12 ${MAP_W} 396`} role="img" aria-label={copy.mapLabel} preserveAspectRatio="xMidYMid meet">
        {OUTLINES.map(([code, d]) => {
          const n = by.get(code)
          return (
            <path
              key={code}
              d={d}
              fill={fill(n)}
              className={n ? 'has' : undefined}
              onMouseEnter={() => setHover(code)}
              onMouseLeave={() => setHover(null)}
              onClick={n ? () => onPick(code) : undefined}
            />
          )
        })}
      </svg>
      <div className="xmap-foot" aria-live="polite">
        {shown ? (
          <span>
            <Flag code={shown} /> <b>{countryName(shown)}</b> <span className="num">{copy.mapVisitors(fmtInt(by.get(shown) ?? 0))}</span>
          </span>
        ) : (
          <span>{copy.mapFoot(fmtInt(by.size))}</span>
        )}
        <span className="xmap-scale" aria-hidden="true">
          {[0, 0.15, 0.45, 1].map((t) => (
            <i key={t} style={{ background: fill(peak * t) }} />
          ))}
        </span>
      </div>
    </div>
  )
}
