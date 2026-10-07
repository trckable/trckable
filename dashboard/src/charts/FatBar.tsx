// A thick rounded bar on a hatched track, the number written inside when the
// bar is long enough to hold it. `width` is a share of the track, 0 to 100.
import type { ReactNode } from 'react'

/** A bar shorter than this share of its track has no room for its number. */
const LABEL_FROM = 16

export function FatBar({ width, color, label, thin }: { width: number; color?: string; label?: ReactNode; thin?: boolean }) {
  return (
    <span className={thin ? 'bl-line thin' : 'bl-line'} aria-hidden="true">
      <i style={{ width: `${width}%`, background: color }}>{label !== undefined && width >= LABEL_FROM && <b className="bl-in num">{label}</b>}</i>
    </span>
  )
}
