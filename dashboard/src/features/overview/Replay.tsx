// Replay, made small: a ▶ in the chart's corner, with its speed beside it and
// the scrubber under the chart shown on hover or focus (always while it plays
// or a day is picked, and always on touch screens, which have no hover).
import { Pause, Play } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { PAD_L } from '../../charts/plot'
import { copy } from './copy'
import { loadReplay } from './replayLoad'

// The speed shows only once the chart is pointed at: its own small chunk,
// with a slot of its size meanwhile so nothing moves when it arrives.
const SpeedMenu = lazy(() => import('../../components/SpeedMenu').then((m) => ({ default: m.SpeedMenu })))

// Pointed at, pressed or focused: fetch what a replay needs, so it starts the moment the press lands.
const warm = () => void loadReplay().catch(() => {})

export function ReplayButton(p: { playing: boolean; byDay: boolean; byHour?: boolean; speed: string; points: number; onPlay: () => void; onSpeed: (id: string) => void }) {
  const Icon = p.playing ? Pause : Play
  let label = copy.replay
  if (p.playing) label = copy.pause
  else if (p.byDay) label = copy.replayByDay
  else if (p.byHour) label = copy.replayByHour
  return (
    <span className="replay">
      <span className="replay-speed">
        <Suspense fallback={<span className="speed-slot" />}>
          <SpeedMenu speed={p.speed} points={p.points} onPick={p.onSpeed} />
        </Suspense>
      </span>
      <button type="button" className="btn icon ghost replay-btn" data-key="replay" onPointerEnter={warm} onPointerDown={warm} onFocus={warm} onClick={p.onPlay} aria-label={label} title={label}>
        <Icon size={15} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
      </button>
    </span>
  )
}

/** The scrubber under the plot: its track starts where the plot does and its
 *  knob sits under the same bucket's point, so both read as one axis. */
export function ScrubBar(p: { n: number; at: number; day?: string; onScrub: (i: number) => void }) {
  return (
    <div className="scrub quiet" style={{ ['--pad' as string]: `${PAD_L}px` }}>
      <span className="scrub-track" aria-hidden="true" />
      <label htmlFor="scrub" className="sr">
        {copy.scrub}
      </label>
      <input id="scrub" type="range" min={0} max={p.n - 1} step={1} value={p.at < 0 ? p.n - 1 : p.at} aria-valuetext={p.day ?? copy.wholePeriod} onChange={(e) => p.onScrub(+e.target.value)} />
    </div>
  )
}
