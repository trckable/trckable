// Who is on the site, a row each: the page, where from, the country, the device, and a way into their visit.
// Eight rows show; the rest open in place, so the list never scrolls inside its card.
import { goalName } from '../../lib/goalName'
import { useState } from 'react'
import type { Row } from '../../features/live/model'
import { copy as off } from '../../features/cookieless/copy'
import { why } from '../../features/cookieless/why'
import { useLeaving } from '../../features/live/useLeaving'
import { channelLabel } from '../../lib/palette'
import { copy as liveCopy } from '../../features/live/copy'
import { copy } from '../live/copy'

const SHOWN = 8

export function FeedList({ rows, up, clock, more, empty, onVisitor, cookieless }: { rows: Row[]; up: Set<string>; clock: number; more: number; empty: string; onVisitor?: (v: string) => void; cookieless?: boolean }) {
  const [all, setAll] = useState(false)
  const list = useLeaving(rows)
  const shown = all ? list : list.slice(0, SHOWN)
  return (
    <div className="lfeed">
      {shown.length === 0 && <div className="mk-quiet" style={{ padding: '16px 20px' }}>{empty}</div>}
      {shown.map((r) => {
        const src = r.referrer ? r.referrer.replace(/^www\./, '') : channelLabel(r.channel || 'Direct')
        const page = r.kind === 'goal' ? { title: liveCopy.goal(goalName(r.label, r.goal ?? '')), text: liveCopy.goal(goalName(r.label, r.goal ?? '')) } : { title: r.path, text: r.kind === 'active' ? copy.still : (r.path ?? '/') }
        const hot = up.has(r.channel || 'Direct') || clock - r.last < 30_000
        return (
          <button key={r.key} type="button" className="lv" onClick={() => r.visitor && onVisitor?.(r.visitor)} disabled={!r.visitor || !onVisitor}>
            <span className={`mk-dot ${hot ? '' : 'off'}`} />
            <span className="pg mono" title={page.title}>{page.text}</span>
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
      {cookieless && (
        <p className="mk-quiet cookieless-note" title={why} style={{ padding: '0 20px 16px', margin: 0, fontSize: 12 }}>
          {off.journeysOff}
        </p>
      )}
    </div>
  )
}
