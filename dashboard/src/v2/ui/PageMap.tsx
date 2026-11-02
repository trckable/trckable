// The site at a glance: one tile a page, as big as the people it had. A tap filters by that page.
import { useWidth } from '../../charts/useWidth'
import { fmtInt } from '../../lib/format'

export interface Tile {
  key: string
  name: string
  v: number
}

export interface Placed extends Tile {
  x: number
  y: number
  w: number
  h: number
}

/** Lays tiles out by halving the rest along its longer side, so each area matches its value and none gets a sliver. */
export function layout(items: Tile[], x: number, y: number, w: number, h: number): Placed[] {
  if (items.length === 0) return []
  if (items.length === 1) return [{ ...items[0], x, y, w, h }]
  const total = items.reduce((p, t) => p + t.v, 0) || 1
  let split = 1
  let sum = items[0].v
  while (split < items.length - 1 && sum + items[split].v <= total / 2) sum += items[split++].v
  const share = sum / total
  return w >= h
    ? [...layout(items.slice(0, split), x, y, w * share, h), ...layout(items.slice(split), x + w * share, y, w * (1 - share), h)]
    : [...layout(items.slice(0, split), x, y, w, h * share), ...layout(items.slice(split), x, y + h * share, w, h * (1 - share))]
}

export function PageMap({ rows, label, onPick, height = 210 }: { rows: Tile[]; label: string; onPick?: (key: string) => void; height?: number }) {
  const { ref, w } = useWidth<HTMLDivElement>()
  const list = rows.filter((r) => r.v > 0).toSorted((a, b) => b.v - a.v).slice(0, 12)
  const top = list[0]?.v || 1
  return (
    <div ref={ref} className="pm" role="group" aria-label={label} style={{ height }}>
      {w > 0 && layout(list, 0, 0, w, height).map((t, i) => (
        <button key={t.key} type="button" className="pm-t" title={`${t.name}: ${fmtInt(t.v)}`} onClick={() => onPick?.(t.key)} style={{ left: t.x, top: t.y, width: t.w, height: t.h, animationDelay: `${i * 35}ms`, background: `color-mix(in srgb, var(--mk-soft) ${Math.round(14 + (t.v / top) * 52)}%, var(--mk-card))` }}>
          {t.w > 58 && t.h > 34 && (
            <>
              <span className="mono">{t.name}</span>
              <b>{fmtInt(t.v)}</b>
            </>
          )}
        </button>
      ))}
    </div>
  )
}
