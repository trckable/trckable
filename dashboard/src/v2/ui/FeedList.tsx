// Who is on the site, a row each: the page, where from, the country, the device, and a way into their visit.
// Every row shows; the list scrolls inside its card.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Row } from '../../features/live/model'
import { copy as off } from '../../features/cookieless/copy'
import { why } from '../../features/cookieless/why'
import { useLeaving } from '../../features/live/useLeaving'
import { channelLabel } from '../../lib/palette'
import { Avatar } from '../../components/visitor/Avatar'
import { nameOf } from '../../lib/visitor'
import { copy as liveCopy } from '../../features/live/copy'
import { copy } from '../live/copy'
import { useArrivals } from '../live/useArrivals'

export function FeedList({ rows, up, clock, empty, onVisitor, cookieless }: { rows: Row[]; up: Set<string>; clock: number; empty: string; onVisitor?: (v: string) => void; cookieless?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [below, setBelow] = useState(false)
  const [above, setAbove] = useState(false)
  // A soft fade at each edge of the list while more rows wait past it, so rows never end in a hard cut under the head.
  const look = useCallback(() => {
    const el = box.current
    if (!el) return
    setBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    setAbove(el.scrollTop > 4)
  }, [])
  useEffect(() => {
    const el = box.current
    if (!el) return
    look()
    const ro = new ResizeObserver(look)
    ro.observe(el)
    return () => ro.disconnect()
  }, [look, rows.length])
  const marks = useArrivals(rows.map((r) => r.key))
  const list = useLeaving(rows)
  return (
    <div className="lfeed" ref={box} data-below={below || undefined} data-above={above || undefined} onScroll={look}>
      {list.length === 0 && <div className="mk-quiet" style={{ padding: '16px 20px' }}>{empty}</div>}
      {list.map((r) => {
        const src = r.referrer ? r.referrer.replace(/^www\./, '') : channelLabel(r.channel || 'Direct')
        const page = r.kind === 'goal' ? { title: liveCopy.goal(r.label || (r.goal ?? '')), text: liveCopy.goal(r.label || (r.goal ?? '')) } : { title: r.path, text: r.kind === 'active' ? copy.still : (r.path ?? '/') }
        const hot = up.has(r.channel || 'Direct') || clock - r.last < 30_000
        return (
          <button key={r.key} type="button" className={`lv ${r.leaving ? 'leaving' : (marks.get(r.key) ?? '')}`.trim()} onClick={() => r.visitor && onVisitor?.(r.visitor)} disabled={r.leaving || !r.visitor || !onVisitor}>
            <span className={`mk-dot ${hot ? '' : 'off'}`} />
            {r.visitor && (
              <>
                <Avatar id={r.visitor} size={20} />
                <span className="vn">{nameOf(r.visitor)}</span>
              </>
            )}
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
      {cookieless && (
        <p className="mk-quiet cookieless-note" title={why} style={{ padding: '0 20px 16px', margin: 0, fontSize: 12 }}>
          {off.journeysOff}
        </p>
      )}
    </div>
  )
}
