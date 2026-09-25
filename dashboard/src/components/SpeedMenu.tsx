// How fast a replay runs: one small button beside Replay that opens the four
// speeds. It opens upwards, since it sits at the foot of the chart.
import { Check, ChevronDown, Gauge } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const SPEEDS: { v: number; name: string }[] = [
  { v: 0.5, name: 'Slow' },
  { v: 1, name: 'Normal' },
  { v: 2, name: 'Fast' },
  { v: 4, name: 'Fastest' },
]

export function SpeedMenu({ speed, onPick }: { speed: number; onPick: (v: number) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={root} className="speed-menu">
      <button type="button" className="btn speed-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Replay speed: ${speed}×`} onClick={() => setOpen((o) => !o)}>
        <Gauge size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className="num">{speed}×</span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="pop menu-pop speed-pop" role="menu">
          <div className="menu-pop-head">
            <b>Replay speed</b>
          </div>
          <div className="menu-list">
            {SPEEDS.map((s, i) => (
              <button key={s.v} type="button" role="menuitemradio" aria-checked={speed === s.v} className={'menu-row speed-row' + (speed === s.v ? ' on' : '')} onClick={() => (onPick(s.v), setOpen(false))}>
                {/* Bars that rise with the speed: the choice at a glance. */}
                <span className={'icon-tile small speed-bars' + (speed === s.v ? ' accent' : '')} aria-hidden="true">
                  {[0, 1, 2, 3].map((b) => (
                    <i key={b} className={b <= i ? 'lit' : undefined} style={{ height: 4 + b * 3 }} />
                  ))}
                </span>
                <span className="menu-title">{s.name}</span>
                <span className="speed-chip num">{s.v}×</span>
                <span className="speed-check" aria-hidden="true">
                  {speed === s.v && <Check size={15} strokeWidth={2.25} />}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
