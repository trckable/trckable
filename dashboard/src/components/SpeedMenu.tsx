// How fast a replay runs: one small button beside Replay that opens the three
// speeds. It opens upwards, since it sits at the foot of the chart.
import { ChevronDown, Gauge } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { lazyLoad, warm } from '../lib/lazyLoad'
import './SpeedMenu.css'

// The three speeds are their own chunk, fetched when a pointer or focus
// reaches the button (lib/lazyLoad).
const SpeedPop = lazyLoad(() => import('./SpeedPop'))

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
      <button type="button" className="btn speed-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Replay speed: ${speed}×`} {...warm(SpeedPop.preload)} onClick={() => setOpen((o) => !o)}>
        <Gauge size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className="num">{speed}×</span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <SpeedPop speed={speed} onPick={(v) => { onPick(v); setOpen(false) }} />
        </Suspense>
      )}
    </div>
  )
}
