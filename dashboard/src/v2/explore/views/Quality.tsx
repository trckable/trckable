// Channel quality: one line that says what matters, and each source with its landing page, speed, how many stay and how many convert.
import type { CSSProperties } from 'react'
import { SourceMark } from '../../../components/visitor/SourceMark'
import { midTruncate } from '../../../features/signals/surge'
import { fmtInt } from '../../../lib/format'
import type { Quality as Model } from '../types'
import { copy } from '../copy'
import { openExplore } from '../open'
import { ENOUGH, rateFor, SLOW_MS, type QualityRow } from '../data/quality'

const NONE = '–'
const pct = (r: number | null) => (r === null ? NONE : `${Math.round(r * 100)}%`)
const secs = (ms: number | null) => (ms === null ? NONE : `${(ms / 1000).toFixed(1)} s`)

export function Quality({ d }: { d: Model }) {
  // A column with nothing measured says nothing: it goes.
  const speed = d.rows.some((r) => r.lcp !== null)
  const engaged = d.main !== 'engaged'
  const pays = d.main === 'goal' && d.paid
  const top = Math.max(0, ...d.rows.map((r) => rateFor(r, d.main) ?? 0))
  const mainName = { goal: copy.qReach(d.goal ?? ''), sales: copy.qPays, engaged: copy.qEngaged }[d.main]
  const tracks = ['minmax(0,1fr)', '64px', 'minmax(0,1.3fr)', ...(speed ? ['64px'] : []), ...(engaged ? ['64px'] : []), ...(pays ? ['64px'] : []), 'minmax(130px,1.2fr)'].join(' ')
  const meta = (r: QualityRow) => [fmtInt(r.people), r.page ? midTruncate(r.page, 24) : null, r.lcp === null ? null : secs(r.lcp)].filter(Boolean).join(' · ')
  return (
    <>
      <p className="xchg-say">{d.say}</p>
      <div className="xt xqual" style={{ '--xq': tracks } as CSSProperties}>
        <div className="xth">
          <span>{copy.qSource}</span>
          <span>{copy.qPeople}</span>
          <span>{copy.qLands}</span>
          {speed && <span>{copy.qLoads}</span>}
          {engaged && <span>{copy.qEngaged}</span>}
          {pays && <span>{copy.qPays}</span>}
          <span>{mainName}</span>
        </div>
        {d.rows.map((r) => {
          const rate = rateFor(r, d.main)
          return (
            <button key={r.value} type="button" className="xrw" onClick={() => openExplore('sources', [{ dim: 'channel', value: r.value }])}>
              <span className="xq-name"><SourceMark channel={r.value} size={18} />{r.name}</span>
              <span className="mk-n xq-col">{fmtInt(r.people)}</span>
              <span className="mono xqual-page xq-col" title={r.page ?? undefined}>{r.page ? midTruncate(r.page, 28) : NONE}</span>
              {speed && <span className={`mk-n xq-col${r.lcp !== null && r.lcp > SLOW_MS ? ' xqual-slow' : ''}`}>{secs(r.lcp)}</span>}
              {engaged && <span className="mk-n xq-col">{pct(r.engaged)}</span>}
              {pays && <span className="mk-n xq-col">{pct(r.sales)}</span>}
              <span className={`xqual-rate${rate !== null && rate === top ? ' best' : ''}`}>
                <i><b style={{ width: `${((rate ?? 0) / (top || 1)) * 100}%` }} /></i>
                <em>{pct(rate)}</em>
              </span>
              <span className={`xq-meta${r.lcp !== null && r.lcp > SLOW_MS ? ' xqual-slow' : ''}`}>{meta(r)}</span>
            </button>
          )
        })}
      </div>
      <p className="xchg-rest">{copy.qEnough(ENOUGH)}</p>
    </>
  )
}
