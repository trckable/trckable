// Live's globe view, the one lazy chunk: the globe with its pins in one card, the recent activity beside it in another.
// Both cards sit where the overview's two cards sit, so switching moves nothing below them. A pin, or a row of the
// list, opens the same popover; while it is open the globe holds still.
import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useFullscreen } from '../../../lib/fullscreen'
import type { Row } from '../../../features/live/model'
import { copy } from '../copy'
import { GlobeFeed } from './GlobeFeed'
import { GlobePopover, type Open } from './GlobePopover'
import { GlobeStage, type Pick } from './GlobeStage'
import { pinKeyOf, pinsOf, rowsAt, type Pin } from './geo'
import './globe.css'

const FULL = 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4'
const LEAVE = 'M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4'

export default function GlobePanel({ rows, clock, online, bar, pulse, height, site, onVisitor }: { rows: Row[]; clock: number; online: number; bar: ReactNode; pulse: string; height?: number; site: string; onVisitor?: (v: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const full = useFullscreen(root)
  const [open, setOpen] = useState<Open | null>(null)
  // The pins change only when someone arrives, leaves or moves on, not with every tick of the clock.
  const found = pinsOf(rows)
  const sig = found.map((p) => `${p.sig}#${p.n}`).join()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sig is the pins' content
  const pins = useMemo<Pin[]>(() => found, [sig])
  // Where the spot is is kept in `open`, so the popover stays on it after the last person has left.
  const sel = useMemo<Pick | null>(() => (open ? { key: open.key, lat: open.lat, lon: open.lon } : null), [open])
  const here = useMemo(() => (open ? rowsAt(rows, open.key) : []), [rows, open])
  const close = useCallback(() => setOpen(null), [])
  const at = (key: string, row: string | null) => {
    const p = pins.find((x) => x.key === key)
    if (p) setOpen({ key, row, cc: p.cc, city: p.city, lat: p.lat, lon: p.lon })
  }
  const label = full.on ? copy.exitFullscreen : copy.fullscreen
  return (
    <div className="liveview gwrap" ref={root} style={height ? ({ '--gh': `${height}px` } as CSSProperties) : undefined}>
      <section className="mk-card gcard">
        <div className="lhead">
          <span className={`mk-pulse ${pulse}`} />
          <span className="lt">{copy.live}</span>
          <span className="mk-quiet lm">{copy.people(online)}</span>
          {bar}
          <button type="button" className="gfs" aria-label={label} title={label} onClick={full.toggle}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={full.on ? LEAVE : FULL} />
            </svg>
          </button>
        </div>
        <GlobeStage pins={pins} people={online} sel={sel} onPick={(k) => at(k, null)}>
          {open && <GlobePopover open={open} rows={here} clock={clock} site={site} onVisitor={onVisitor} onRow={(k) => setOpen({ ...open, row: k })} onClose={close} />}
        </GlobeStage>
      </section>
      <section className="mk-card lon gside">
        <div className="lhead">
          <span className="lt">{copy.recent}</span>
        </div>
        <GlobeFeed rows={rows} clock={clock} active={open?.key ?? null} onPick={(r) => at(pinKeyOf(r), r.key)} />
      </section>
    </div>
  )
}
