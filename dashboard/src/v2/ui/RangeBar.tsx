// The usual band as a bar, and a dot where the number is.
import { place } from '../live/liveModel'

export function Rng({ v, lo, hi, max }: { v: number; lo: number; hi: number; max: number }) {
  return (
    <div className="rng">
      <i style={{ left: `${place(lo, max)}%`, width: `${Math.max(1, place(hi, max) - place(lo, max))}%` }} />
      <b style={{ left: `${place(v, max)}%` }} />
    </div>
  )
}
