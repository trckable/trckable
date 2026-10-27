// What a person pinned with Watch: each line says how the number moved since they started watching.
import { Ico } from './icons'
import { copyOf } from './watchCopy'
import './watchCard.css'

interface WatchRow {
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
    <section className="watchc">
      <div className="wh">
        <b>{copyOf.watching}</b>
        <span>{copyOf.pinned}</span>
      </div>
      {rows.map((r) => (
        <div className="wrow" key={r.key}>
          <Ico name={r.key} className="ic-i" />
          <span className="wl">
            <b>{r.topic}</b>
            <span className="wv">
              {copyOf.since(r.since.at)} <b>{r.since.delta}</b> {r.since.unit}
            </span>
          </span>
          {r.gone && <span className="ic-bd up">{copyOf.back}</span>}
          <button type="button" className="xb" onClick={() => onStop(r.key)}>
            {copyOf.stop}
          </button>
        </div>
      ))}
    </section>
  )
}
