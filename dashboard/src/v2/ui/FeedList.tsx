// Who is on the site, a row each: the page, where from, the country, the device, and a way into their visit.
// Every row shows; the list scrolls inside its card.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Row } from '../../features/live/model'
import { copy as off } from '../../features/cookieless/copy'
import { why } from '../../features/cookieless/why'
import { useLeaving } from '../../features/live/useLeaving'
import { countryName } from '../../lib/format'
import { Flag } from './Flag'
import { channelLabel } from '../../lib/palette'
import { Avatar } from '../../components/visitor/Avatar'
import { DeviceIcon } from '../../components/visitor/DeviceIcon'
import { nameOf } from '../../lib/visitor'
import { copy as liveCopy } from '../../features/live/copy'
import { isSignup } from '../../features/signals/signupLine'
import { copy } from '../live/copy'
import { useArrivals } from '../live/useArrivals'
import './feedRow.css'

/** Under this width (px) the list drops the visitor's name and the word Replay, so the page keeps the room. */
const NARROW = 480

/** How long ago the row's last activity was, short: "12s", "3m". */
export const agoShort = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.floor(ms / 1000))}s` : `${Math.floor(ms / 60_000)}m`)

export function FeedList({ rows, up, signup, clock, empty, onVisitor, cookieless }: { rows: Row[]; up: Set<string>; signup?: string; clock: number; empty: string; onVisitor?: (v: string) => void; cookieless?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [below, setBelow] = useState(false)
  const [above, setAbove] = useState(false)
  // A soft fade at each edge of the list while more rows wait past it, so rows never end in a hard cut under the head.
  const look = useCallback(() => {
    const el = box.current
    if (!el) return
    setBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    setAbove(el.scrollTop > 4)
    // A narrow card gives its width to the page: the visitor's name and the Replay word step aside (feedRow.css).
    el.toggleAttribute('data-narrow', el.clientWidth < NARROW)
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
          <button key={r.key} type="button" className={`lv ${r.leaving ? 'leaving' : (marks.get(r.key) ?? '')}${isSignup(r, signup) ? ' signup' : ''}`.trim()} onClick={() => r.visitor && onVisitor?.(r.visitor)} disabled={r.leaving || !r.visitor || !onVisitor}>
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
            <span className="cc" title={r.country ? countryName(r.country) : undefined}>
              {r.country?.length === 2 ? (
                <>
                  <Flag code={r.country} />
                  <span className="ccn">{r.country.toUpperCase()}</span>
                </>
              ) : (
                '\u2014'
              )}
            </span>
            <span className="tm num">{agoShort(clock - r.last)}</span>
            <span className="dv" title={r.device} aria-label={r.device}>
              {r.device && <DeviceIcon device={r.device} size={15} />}
            </span>
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
