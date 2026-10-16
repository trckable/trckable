// What a person pinned with Watch: each line says how the number moved since they started watching.
import { copyOf } from './watchCopy'

export interface WatchRow {
  key: string
  topic: string
  /** The card is no longer among the day's: it went back to normal. */
  gone: boolean
  /** "Since you started watching (16:30): +12 people". */
  since: { at: string; delta: string; unit: string }
}

export function WatchCard({ rows, onStop }: { rows: WatchRow[]; onStop: (key: string) => void }) {
  if (!rows.length) return null
  return (
    <section className="mk-card watchc">
      <div className="wh">
        <span>{copyOf.watching}</span>
        <span className="mk-quiet">{copyOf.pinned}</span>
      </div>
      {rows.map((r) => (
        <div className="wrow" key={r.key}>
          <span className="wl">
            <b>{r.topic}</b>
            {r.gone ? copyOf.back : ''}
          </span>
          <span className="wv">
            {copyOf.since(r.since.at)} <b>{r.since.delta}</b> {r.since.unit}
          </span>
          <button type="button" className="gh" onClick={() => onStop(r.key)}>
            {copyOf.stop}
          </button>
        </div>
      ))}
    </section>
  )
}
