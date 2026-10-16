// "On the site right now": one row per person, newest first. New visits
// slide in at the top with a soft glow; someone idle for five minutes fades
// and leaves. The count in the sticky header rolls to its new value.
import { CircleHelp, Moon, Users } from 'lucide-react'
import { Tooltip } from '../../kit/Tooltip'
import { when } from '../sitestatus/time'
import { copy } from './copy'
import { FeedRow } from './FeedRow'
import { moreOf, type Row } from './model'
import { useLeaving } from './useLeaving'
import { useTicking } from './useTicking'
import { useTween } from '../../lib/motion'
import { copy as off } from '../cookieless/copy'
import { why } from '../cookieless/why'
import './OnSitePanel.css'

function Count({ n }: { n: number }) {
  const shown = Math.round(useTween(n, 400))
  return (
    <span className="faint num live-meta">
      {copy.people(shown)}
    </span>
  )
}

export function OnSitePanel(p: { rows: Row[]; online: number | null; clock: number; skew?: number; onVisitor?: (visitor: string) => void; cookieless?: boolean; quiet?: number }) {
  const rows = useLeaving(p.rows)
  const more = moreOf(p.online, rows.length)
  const clock = useTicking(p.clock, p.skew ?? 0)
  const quiet = p.quiet
  return (
    <section className={'card live-panel live-onsite' + (rows.length === 0 ? ' none' : '')} aria-labelledby="live-onsite-title">
      <div className="live-head-row">
        <span className="kit-tile" aria-hidden="true">
          <Users size={15} strokeWidth={1.8} />
        </span>
        <h2 id="live-onsite-title">{copy.onSite}</h2>
        <Tooltip text={copy.footer}>
          {(t) => (
            <button type="button" className="live-help" aria-label={copy.help} {...t}>
              <CircleHelp size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
        </Tooltip>
        {p.online !== null && <Count n={p.online} />}
      </div>
      {/* A phone glances: the count and the last visit on one line, the list is for a wider screen. */}
      {rows.length > 0 && <p className="live-brief faint">{copy.lastVisit(copy.ago(clock - rows[0].last))}</p>}
      <ol className="live-feed">
        {rows.length === 0 && (
          <li className="empty">
            {quiet !== undefined ? (
              <Tooltip text={copy.quietTip}>
                {(t) => (
                  <button type="button" className="live-quiet" {...t}>
                    <Moon size={14} strokeWidth={1.8} aria-hidden="true" />
                    {copy.quietSince(when(quiet))}
                  </button>
                )}
              </Tooltip>
            ) : (
              copy.empty
            )}
          </li>
        )}
        {rows.map((v) => (
          <FeedRow key={v.key} v={v} clock={clock} leaving={v.leaving} onVisitor={p.onVisitor} />
        ))}
        {more > 0 && <li className="faint num live-more">{copy.more(more)}</li>}
      </ol>
      {p.cookieless && (
        <p className="faint cookieless-note" title={why}>
          {off.journeysOff}
        </p>
      )}
    </section>
  )
}
