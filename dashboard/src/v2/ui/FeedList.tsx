// Who is on the site, a row each: the page, where from, the country, the device, and a way into their visit.
// Eight rows show; the rest open in place, so the list never scrolls inside its card.
import { useState } from 'react'
import type { Row } from '../../features/live/model'
import { useLeaving } from '../../features/live/useLeaving'
import { channelLabel } from '../../lib/palette'
import { copy } from '../live/copy'

const SHOWN = 8

export function FeedList({ rows, up, clock, more, empty, onVisitor }: { rows: Row[]; up: Set<string>; clock: number; more: number; empty: string; onVisitor?: (v: string) => void }) {
  const [all, setAll] = useState(false)
  const list = useLeaving(rows)
  const shown = all ? list : list.slice(0, SHOWN)
  return (
    <div className="lfeed">
      {shown.length === 0 && <div className="mk-quiet" style={{ padding: '16px 20px' }}>{empty}</div>}
      {shown.map((r) => {
        const src = r.referrer ? r.referrer.replace(/^www\./, '') : channelLabel(r.channel || 'Direct')
        const hot = up.has(r.channel || 'Direct') || clock - r.last < 30_000
        return (
          <button key={r.key} type="button" className="lv" onClick={() => r.visitor && onVisitor?.(r.visitor)} disabled={!r.visitor || !onVisitor}>
            <span className={`mk-dot ${hot ? '' : 'off'}`} />
            <span className="pg mono" title={r.path}>{r.kind === 'active' ? copy.still : (r.path ?? '/')}</span>
            <span className="src" style={hot ? { color: 'var(--mk-lime)' } : undefined}>
              {src}
            </span>
            <span className="cc">{r.country?.toUpperCase()}</span>
            <span className="dv">{r.device}</span>
            {r.visitor && onVisitor && (
              <span className="mk-rp" title={copy.replayTitle}>
                {'\u25B6'}<em> {copy.replay}</em>
              </span>
            )}
          </button>
        )
      })}
      {(list.length > SHOWN || more > 0) && !all && (
        <button type="button" className="seeall" onClick={() => setAll(true)}>
          {copy.seeAll(list.length + more)} {'\u203A'}
        </button>
      )}
    </div>
  )
}
