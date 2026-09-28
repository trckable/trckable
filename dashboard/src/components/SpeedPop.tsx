// The replay speeds, opened above the button (SpeedMenu.tsx). Its own chunk.
import { Check } from 'lucide-react'
import './MenuPop.css'

const SPEEDS: { v: number; name: string }[] = [
  { v: 1, name: 'Normal' },
  { v: 2, name: 'Fast' },
  { v: 4, name: 'Fastest' },
]

export default function SpeedPop({ speed, onPick }: { speed: number; onPick: (v: number) => void }) {
  return (
    <div className="pop menu-pop speed-pop" role="menu">
      <div className="menu-pop-head">
        <b>Replay speed</b>
      </div>
      <div className="menu-list">
        {SPEEDS.map((s, i) => (
          <button key={s.v} type="button" role="menuitemradio" aria-checked={speed === s.v} className={'menu-row speed-row' + (speed === s.v ? ' on' : '')} onClick={() => onPick(s.v)}>
            {/* Bars that rise with the speed: the choice at a glance. */}
            <span className={'icon-tile small speed-bars' + (speed === s.v ? ' accent' : '')} aria-hidden="true">
              {[0, 1, 2].map((b) => (
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
  )
}
