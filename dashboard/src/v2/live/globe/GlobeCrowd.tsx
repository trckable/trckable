// The people of a marker that zooming cannot split any more (one shared city, or the most zoom): a list in the visitor card's place.
// A row opens that visitor's card, which has a way back here.
import { Avatar } from '../../../components/visitor/Avatar'
import { SourceMark } from '../../../components/visitor/SourceMark'
import { copy as jcopy } from '../../../features/journey/copy'
import type { Row } from '../../../features/live/model'
import { countryName, flag } from '../../../lib/format'
import { nameOf } from '../../../lib/visitor'
import { channelLabel } from '../../../lib/palette'
import { copy } from '../copy'
import { agoOf } from './geo'

/** The most rows listed; the rest are counted. */
export const CROWD_MAX = 50

const sourceOf = (r: Row) => (r.referrer ? r.referrer.replace(/^www\./, '') : channelLabel(r.channel || 'Direct'))
const pageOf = (r: Row) => (r.kind === 'goal' ? `${jcopy.goal}: ${r.label || r.goal}` : (r.path ?? '/'))
const ago = (ms: number) => {
  const a = agoOf(ms)
  return a.unit === 's' ? copy.agoSec(a.n) : copy.agoMin(a.n)
}

export function GlobeCrowd({ rows, title, clock, onPick, onClose }: { rows: Row[]; title: string; clock: number; onPick: (key: string) => void; onClose: () => void }) {
  const shown = rows.slice(0, CROWD_MAX)
  return (
    <div className="gcardv gcrowd">
      <div className="gpop-top">
        <div className="gwho">
          <b>{copy.crowdTitle(rows.length, title)}</b>
        </div>
        <button type="button" className="gpop-x" aria-label={copy.close} title={copy.close} onClick={onClose}>
          ×
        </button>
      </div>
      <ul className="gcrows">
        {shown.map((r) => (
          <li key={r.key}>
            <button type="button" className="gcrow" onClick={() => onPick(r.key)}>
              {r.visitor ? <Avatar id={r.visitor} size={28} live /> : <span className="gcc" aria-hidden="true">{flag(r.country ?? '')}</span>}
              <span className="gcwho">
                <b>{r.visitor ? nameOf(r.visitor) : [r.city, r.country ? countryName(r.country) : ''].filter(Boolean).join(', ')}</b>
                <code className="mono">{pageOf(r)}</code>
              </span>
              <SourceMark channel={r.channel || 'Direct'} referrer={r.referrer} size={16} />
              <span className="mk-quiet">{sourceOf(r)}</span>
              <span className="mk-quiet gct">{ago(clock - r.last)}</span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && <span className="mk-quiet">{copy.crowdMore(rows.length - shown.length)}</span>}
    </div>
  )
}
