// "On the site right now": one row per person, newest first. New visits
// slide in at the top with a soft glow; someone idle for five minutes fades
// and leaves. The count in the sticky header rolls to its new value.
import { copy } from './copy'
import { FeedRow } from './FeedRow'
import { moreOf, type Row } from './model'
import { useLeaving } from './useLeaving'
import { useTicking } from './useTicking'
import { useTween } from '../../lib/motion'
import { copy as off } from '../cookieless/copy'
import './OnSitePanel.css'

function Count({ n }: { n: number }) {
  const shown = Math.round(useTween(n, 400))
  return (
    <span className="faint num live-meta">
      {copy.people(shown)}
    </span>
  )
}

export function OnSitePanel(p: { rows: Row[]; online: number | null; clock: number; skew?: number; onVisitor?: (visitor: string) => void; cookieless?: boolean }) {
  const rows = useLeaving(p.rows)
  const more = moreOf(p.online, rows.length)
  const clock = useTicking(p.clock, p.skew ?? 0)
  return (
    <section className="card live-panel live-onsite" aria-labelledby="live-onsite-title">
      <div className="live-head-row">
        <h2 id="live-onsite-title">{copy.onSite}</h2>
        {p.online !== null && <Count n={p.online} />}
      </div>
      <ol className="live-feed">
        {rows.length === 0 && <li className="empty">{copy.empty}</li>}
        {rows.map((v) => (
          <FeedRow key={v.key} v={v} clock={clock} leaving={v.leaving} onVisitor={p.onVisitor} />
        ))}
        {more > 0 && <li className="faint num live-more">{copy.more(more)}</li>}
      </ol>
      {p.cookieless && (
        <p className="faint cookieless-note" title={off.why}>
          {off.journeysOff}
        </p>
      )}
      <p className="live-foot faint">{copy.footer}</p>
    </section>
  )
}
