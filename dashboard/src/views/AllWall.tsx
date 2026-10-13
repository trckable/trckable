// Design A, the live wall: a tile per site meant to be left open. The people
// online lead each tile, then the period's line, the visitors with the move,
// and one line about right now. Sites that need you come first, edged warm.
import { sourceLine, type Surge } from '../features/signals/surge'
import { StateDot } from '../features/sites/StateDot'
import { statusOf } from '../features/sitestatus/status'
import { when } from '../features/sitestatus/time'
import type { Site, SiteRow } from '../lib/api'
import { delta, fmtInt } from '../lib/format'
import { navigate } from '../lib/url'
import { copy as base } from './allSitesCopy'
import { copy } from './allDesignsCopy'
import { wallOrder } from './allDesignsLogic'
import { Spark } from './AllSitesSpark'
import { tagOf } from './AllTile'
import { fromStart } from './allSitesLogic'

type Props = { rows: SiteRow[]; sites: Site[]; surges: Map<string, Surge>; colorOf: (id: string) => string; start: number }

/** The one line about now: who sent the people online when the server knows, else the last visit. */
function nowLine(r: SiteRow, site: Site | undefined, surge: Surge | undefined): string {
  if (r.error) return base.unread
  const fromSurge = surge && !surge.ended ? sourceLine(surge) : ''
  if (fromSurge) return fromSurge
  if (site?.last_event_at) return copy.lastVisit(when(site.last_event_at))
  return base.waiting
}

export function AllWall({ rows, sites, surges, colorOf, start }: Props) {
  const by = new Map(sites.map((s) => [s.id, s]))
  return (
    <div className="wall" role="list" aria-label={copy.wallLabel}>
      {wallOrder(rows, sites).map((r) => {
        const site = by.get(r.id)
        const status = site ? statusOf(site) : 'ok'
        const hurt = status === 'down' || status === 'quiet'
        const tag = tagOf(site)
        const d = r.error ? null : delta(r.visitors, r.previous_visitors)
        return (
          <div key={r.id} role="listitem" className="wall-item">
            <button type="button" className={'wall-tile' + (hurt ? ' hurt ' + status : '')} onClick={() => navigate('/' + encodeURIComponent(r.domain))}>
              <span className="wall-top">
                {site && <StateDot site={site} />}
                <b className="wall-name" title={r.domain}>{r.name || r.domain}</b>
                {tag && <small className="wall-tag">{tag}</small>}
              </span>
              <span className={'wall-live' + (r.online > 0 ? ' on' : '')}>
                {r.online > 0 ? (
                  <>
                    <i aria-hidden="true" />
                    <b>{copy.online(r.online)}</b>
                  </>
                ) : (
                  <span>{copy.nobody}</span>
                )}
              </span>
              {r.visitors > 0 ? <Spark values={fromStart(r.series, start)} color={hurt ? 'var(--money)' : colorOf(r.id)} h={44} /> : <span className="wall-flat" aria-hidden="true" />}
              <span className="wall-num">
                <b>{fmtInt(r.visitors)}</b>
                <small>{copy.visitors}</small>
                {d && <span className={'delta ' + d.tone}>{d.text}</span>}
              </span>
              <span className="wall-now muted">{nowLine(r, site, surges.get(r.id))}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
