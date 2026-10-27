// Live's globe view, the one lazy chunk: the globe with its pins in one card, the recent activity beside it in another.
// Both cards sit where the overview's two cards sit, so switching moves nothing below them. A pin, or a row of the
// list, opens the same popover; while it is open the globe holds still.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFullscreen } from '../../../lib/fullscreen'
import type { Row } from '../../../features/live/model'
import { copy } from '../copy'
import { GlobeFeed } from './GlobeFeed'
import { GlobeHead } from './GlobeHead'
import { GlobeNew } from './GlobeNew'
import { GlobePopover, type Open } from './GlobePopover'
import { GlobeStage, type Pick } from './GlobeStage'
import { pinsOf, type CityFinder, type Pin } from './geo'
import './globe.css'

const FULL = 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4'
const LEAVE = 'M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4'

export default function GlobePanel({ rows, clock, online, bar, pulse, minutes, beat, site, onVisitor }: { rows: Row[]; clock: number; online: number; bar: ReactNode; pulse: string; minutes: number[]; beat: number; site: string; onVisitor?: (v: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const full = useFullscreen(root)
  const [open, setOpen] = useState<Open | null>(null)
  // The pins change only when someone arrives, leaves or moves on, not with every tick of the clock.
  // The cities' places come in their own small chunk; a pin moves onto its city when they are here.
  const [find, setFind] = useState<CityFinder>()
  useEffect(() => {
    let on = true
    void import('./cities').then((m) => on && setFind(() => m.cityAt))
    return () => {
      on = false
    }
  }, [])
  const found = pinsOf(rows, find)
  const sig = `${find ? 1 : 0}|${found.map((p) => p.sig).join()}`
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sig is the pins' content
  const pins = useMemo<Pin[]>(() => found, [sig])
  // Where the spot is is kept in `open`, so the popover stays on it after the last person has left.
  const sel = useMemo<Pick | null>(() => (open ? { key: open.key, lat: open.lat, lon: open.lon } : null), [open])
  const here = open ? rows.find((r) => r.key === open.key) : undefined
  const close = useCallback(() => setOpen(null), [])
  const at = (key: string) => {
    const p = pins.find((x) => x.key === key)
    if (p) setOpen({ key, cc: p.cc, city: p.city, lat: p.lat, lon: p.lon })
  }
  const label = full.on ? copy.exitFullscreen : copy.fullscreen
  return (
    <div className="liveview gwrap" ref={root}>
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
        <GlobeStage pins={pins} people={online} sel={sel} full={full.on} onPick={at}>
          {open && <GlobePopover open={open} row={here} clock={clock} site={site} onVisitor={onVisitor} onClose={close} onLeave={() => full.on && full.toggle()} />}
        </GlobeStage>
        <button type="button" className="gclose" aria-label={copy.exitFullscreen} title={copy.exitFullscreen} onClick={full.toggle}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
        {full.on && (
          <>
            <div className="gfloat">
              <GlobeHead online={online} minutes={minutes} beat={beat} />
            </div>
            <GlobeNew rows={rows} clock={clock} onPick={(r) => at(r.key)} />
          </>
        )}
      </section>
      <section className="mk-card lon gside">
        <GlobeHead online={online} minutes={minutes} beat={beat} />
        <div className="lhead">
          <span className="lt">{copy.recent}</span>
        </div>
        <GlobeFeed rows={rows} clock={clock} active={open?.key ?? null} onPick={(r) => at(r.key)} />
      </section>
    </div>
  )
}
