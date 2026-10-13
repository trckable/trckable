// The live wall: a tile per site meant to be left open. The people online lead
// each tile, then the period's line, the visitors with the move, and one line
// about right now. Sites that need you come first, edged warm. A site that never
// had a visit opens its install tab.
import { sourceLine, type Surge } from '../features/signals/surge'
import { StateDot } from '../features/sites/StateDot'
import { statusOf } from '../features/sitestatus/status'
import { silence, when } from '../features/sitestatus/time'
import type { Site, SiteRow } from '../lib/api'
import { delta, fmtInt } from '../lib/format'
import { openSettings } from '../lib/settings'
import { navigate } from '../lib/url'
import { copy } from './allSitesCopy'
import { Spark } from './AllSitesSpark'
import { fromStart, wallOrder } from './allSitesLogic'

function tagOf(site: Site | undefined): string | null {
  const status = site ? statusOf(site) : 'ok'
  if (status === 'down') return copy.downTag
  return status === 'quiet' && site ? copy.quietTag(silence(site)) : null
}

type Props = { rows: SiteRow[]; sites: Site[]; surges: Map<string, Surge>; colorOf: (id: string) => string; start: number }

/** The one line about now: who sent the people online when the server knows, else the last visit. */
function nowLine(r: SiteRow, site: Site | undefined, surge: Surge | undefined): string {
  if (r.error) return copy.unread
  const fromSurge = surge && !surge.ended ? sourceLine(surge) : ''
  if (fromSurge) return fromSurge
  if (site?.last_event_at) return copy.lastVisit(when(site.last_event_at))
  return copy.waiting
}

export function AllWall({ rows, sites, surges, colorOf, start }: Props) {
  const by = new Map(sites.map((s) => [s.id, s]))
  return (
    <div className="all-tiles" role="list" aria-label={copy.wallLabel}>
      {wallOrder(rows, sites).map((r) => {
        const site = by.get(r.id)
        const status = site ? statusOf(site) : 'ok'
        const hurt = status === 'down' || status === 'quiet'
        const tag = tagOf(site)
        const fresh = status === 'new' && !r.visitors && !r.previous_visitors
        const go = () => (fresh ? openSettings(r, 'install') : navigate('/' + encodeURIComponent(r.domain)))
        const d = r.error ? null : delta(r.visitors, r.previous_visitors)
        return (
          <div key={r.id} role="listitem" className="all-tile-item">
            <button type="button" className={'all-tile' + (hurt ? ' hurt ' + status : '')} onClick={go}>
              <span className="all-tile-top">
                {site && <StateDot site={site} />}
                <b className="all-tile-name" title={r.domain}>{r.name || r.domain}</b>
                {tag && <small className="all-tile-tag">{tag}</small>}
              </span>
              <span className={'all-tile-live' + (r.online > 0 ? ' on' : '')}>
                {r.online > 0 ? (
                  <>
                    <i aria-hidden="true" />
                    <b>{copy.online(r.online)}</b>
                  </>
                ) : (
                  <span>{copy.nobody}</span>
                )}
              </span>
              {!fresh && r.visitors > 0 ? <Spark values={fromStart(r.series, start)} color={hurt ? 'var(--money)' : colorOf(r.id)} h={44} /> : <span className="all-tile-flat" aria-hidden="true" />}
              {!fresh && !r.error && (
                <span className="all-tile-num">
                  <b>{fmtInt(r.visitors)}</b>
                  <small>{copy.visitors}</small>
                  {d && <span className={'delta ' + d.tone}>{d.text}</span>}
                </span>
              )}
              <span className="all-tile-now muted">
                {nowLine(r, site, surges.get(r.id))}
                {fresh && <> · <b>{copy.install}</b></>}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
