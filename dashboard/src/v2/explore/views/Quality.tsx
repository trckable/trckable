// Channel quality: one line that says what matters, and each source with its landing page, conversion and speed.
import { fmtInt } from '../../../lib/format'
import type { Quality as Model } from '../types'
import { copy } from '../copy'
import { openExplore } from '../open'
import { ENOUGH, SLOW_MS } from '../data/quality'

const NONE = '–'

export function Quality({ d }: { d: Model }) {
  // A column with nothing measured says nothing: it goes.
  const speed = d.rows.some((r) => r.lcp !== null)
  const top = Math.max(0, ...d.rows.map((r) => r.rate ?? 0))
  return (
    <>
      <p className="xchg-say">{d.say}</p>
      <div className={`xt xqual${speed ? '' : ' nospeed'}`}>
        <div className="xth">
          <span>{copy.qSource}</span>
          <span>{copy.qPeople}</span>
          <span>{copy.qLands}</span>
          <span>{d.goal ? copy.qReach(d.goal) : copy.qConverts}</span>
          {speed && <span>{copy.qLoads}</span>}
        </div>
        {d.rows.map((r) => (
          <button key={r.value} type="button" className="xrw" onClick={() => openExplore('sources', [{ dim: 'channel', value: r.value }])}>
            <span>{r.name}</span>
            <span className="mk-n">{fmtInt(r.people)}</span>
            <span className="mono xqual-page" title={r.page ?? undefined}>{r.page ?? NONE}</span>
            <span className={`xqual-rate${r.rate !== null && r.rate === top ? ' best' : ''}`}>
              <i><b style={{ width: `${((r.rate ?? 0) / (top || 1)) * 100}%` }} /></i>
              <em>{r.rate === null ? NONE : `${Math.round(r.rate * 100)}%`}</em>
            </span>
            {speed && <span className={`mk-n${r.lcp !== null && r.lcp > SLOW_MS ? ' xqual-slow' : ''}`}>{r.lcp === null ? NONE : `${(r.lcp / 1000).toFixed(1)}s`}</span>}
          </button>
        ))}
      </div>
      <p className="xchg-rest">{copy.qEnough(ENOUGH)}</p>
    </>
  )
}
