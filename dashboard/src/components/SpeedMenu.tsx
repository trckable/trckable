// How fast a replay runs: one small button beside Replay, showing the speed's
// name, that opens the speeds with the time each takes for this period. It
// opens upwards, since it sits at the foot of the chart.
import { ChevronDown, Gauge } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { speedCopy } from '../features/overview/speedCopy'
import { fmtSecs, replaySeconds, speedOf } from '../features/overview/replayTime'
import { lazyLoad, warm } from '../lib/lazyLoad'
import './SpeedMenu.css'

// The speeds are their own chunk, fetched when a pointer or focus reaches the
// button (lib/lazyLoad).
const SpeedPop = lazyLoad(() => import('./SpeedPop'))

export function SpeedMenu({ speed, points, onPick }: { speed: string; points: number; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btn.current?.focus()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const cur = speedOf(speed)
  const label = `${speedCopy.speedNow(cur.name)}, ${speedCopy.playsIn(fmtSecs(replaySeconds(points, cur.secs)))}`
  return (
    <div ref={root} className="speed-menu">
      <button ref={btn} type="button" className="btn speed-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} {...warm(SpeedPop.preload)} onClick={() => setOpen((o) => !o)}>
        <Gauge size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className="speed-name">{cur.name}</span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <SpeedPop
            speed={speed}
            points={points}
            onPick={(id) => {
              onPick(id)
              setOpen(false)
              btn.current?.focus()
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
