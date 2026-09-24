// The map, in its own chunk: 167 country outlines precomputed at build time
// (scripts/build-map.mjs), so there is no map library, no projection code and
// nothing fetched from anywhere. It loads only when the map module is on and
// you are in Full mode.
import { useMemo, useState } from 'react'
import type { Row } from '../lib/api'
import { countryName, flag, fmtInt } from '../lib/format'
import { COUNTRIES, MAP_H, MAP_W } from '../lib/worldmap'

export function WorldMap({ rows, onPick }: { rows: Row[]; onPick?: (code: string) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  // The same hovering idea as the chart: follow the pointer, show the numbers.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const { by, peak } = useMemo(() => {
    const by = new Map<string, number>()
    let peak = 0
    for (const r of rows) {
      by.set(r.value.toUpperCase(), r.visitors)
      peak = Math.max(peak, r.visitors)
    }
    return { by, peak }
  }, [rows])

  // One hue, light to dark: magnitude, never a rainbow. The square root keeps
  // a country with a tenth of the traffic visible instead of black.
  const fill = (n: number | undefined) => {
    if (!n || !peak) return 'var(--grid)'
    const t = Math.sqrt(n / peak)
    return `color-mix(in srgb, var(--accent) ${Math.round(12 + t * 88)}%, var(--sunken))`
  }
  const hovered = hover ? { code: hover, n: by.get(hover) ?? 0 } : null

  return (
    <div
      className="worldmap"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setAt({ x: e.clientX - r.left, y: e.clientY - r.top })
      }}
      onMouseLeave={() => (setHover(null), setAt(null))}
    >
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="Visitors by country" preserveAspectRatio="xMidYMid meet">
        {COUNTRIES.map(([code, d]) => {
          const n = by.get(code)
          return (
            <path
              key={code}
              d={d}
              fill={fill(n)}
              stroke="var(--surface)"
              strokeWidth={n ? 1.2 : 0.8}
              opacity={hover && hover !== code ? 0.55 : 1}
              onMouseEnter={() => setHover(code)}
              onMouseLeave={() => setHover(null)}
              onClick={n && onPick ? () => onPick(code) : undefined}
              style={{ cursor: n && onPick ? 'pointer' : 'default' }}
            />
          )
        })}
      </svg>
      {hovered && at && (
        <div className="chart-tip" style={{ left: Math.min(at.x + 14, 320), top: Math.max(at.y - 16, 0) }} aria-hidden="true">
          <b>
            {flag(hovered.code)} {countryName(hovered.code)}
          </b>
          <span className="num">{fmtInt(hovered.n)} visitors</span>
        </div>
      )}
      <div className="worldmap-foot">
        {hovered ? (
          <span>
            {flag(hovered.code)} <b>{countryName(hovered.code)}</b> <span className="num">{fmtInt(hovered.n)}</span>
          </span>
        ) : (
          <span className="faint">{fmtInt(rows.length)} countries · hover to see one</span>
        )}
        <span className="spacer" style={{ flex: 1 }} />
        <span className="scale" aria-hidden="true">
          <i style={{ background: 'var(--grid)' }} />
          <i style={{ background: fill(peak * 0.15) }} />
          <i style={{ background: fill(peak * 0.45) }} />
          <i style={{ background: fill(peak) }} />
        </span>
        <span className="faint num">{fmtInt(peak)}</span>
      </div>
    </div>
  )
}
