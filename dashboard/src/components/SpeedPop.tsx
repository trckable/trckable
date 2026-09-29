// The replay speeds, opened above the button (SpeedMenu.tsx). Its own chunk.
// Each is a duration for this period, written on the right; ↑ ↓ move, Enter picks.
import { Check } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { copy } from '../features/overview/copy'
import { fmtSecs, replaySeconds, SPEEDS, speedOf } from '../features/overview/replayTime'
import './MenuPop.css'

export default function SpeedPop({ speed, points, onPick }: { speed: string; points: number; onPick: (id: string) => void }) {
  const list = useRef<HTMLDivElement>(null)
  const rows = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  // The chosen speed has the focus on opening, so the arrows start from it.
  useEffect(() => {
    const at = SPEEDS.findIndex((s) => s.id === speed)
    rows()[Math.max(0, at)]?.focus()
  }, [speed])
  const onKey = (e: KeyboardEvent) => {
    const all = rows()
    const i = all.indexOf(document.activeElement as HTMLButtonElement)
    const to = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 } as Record<string, number>)[e.key]
    if (to === undefined) return
    e.preventDefault()
    all[(to + all.length) % all.length]?.focus()
  }
  return (
    <div className="pop menu-pop speed-pop" role="menu" tabIndex={-1} aria-label={copy.speed} onKeyDown={onKey}>
      <div className="menu-pop-head">
        <b>{copy.speed}</b>
        <span className="faint">{copy.playsIn(fmtSecs(replaySeconds(points, speedOf(speed).secs)))}</span>
      </div>
      <div className="menu-list" ref={list}>
        {SPEEDS.map((s, i) => {
          const on = speed === s.id
          return (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={on} tabIndex={on ? 0 : -1} className={'menu-row speed-row' + (on ? ' on' : '')} onClick={() => onPick(s.id)}>
              {/* Bars that rise with the speed: the choice at a glance. */}
              <span className={'speed-bars' + (on ? ' accent' : '')} aria-hidden="true">
                {SPEEDS.map((_, b) => (
                  <i key={b} className={b <= i ? 'lit' : undefined} style={{ height: 4 + b * 2.5 }} />
                ))}
              </span>
              <span className="menu-title">{s.name}</span>
              <span className="speed-time num">{fmtSecs(replaySeconds(points, s.secs))}</span>
              <span className="speed-check" aria-hidden="true">
                {on && <Check size={15} strokeWidth={2.25} />}
              </span>
            </button>
          )
        })}
      </div>
      <div className="menu-pop-head speed-keys faint" aria-hidden="true">
        {copy.speedKeys}
      </div>
    </div>
  )
}
