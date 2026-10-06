// The sites of All sites, in one of two layouts: cards for a few sites, a
// slim list for many. Either way the whole row is the link to the site.
import { delta, fmtInt } from '../lib/format'
import type { SiteRow } from '../lib/api'
import type { Site } from '../lib/api'
import { navigate } from '../lib/url'
import { openSettings } from '../lib/settings'
import { SiteMark } from '../components/SiteMark'
import { OpenSite } from '../features/sites/OpenSite'
import { Spark } from './AllSitesSpark'
import { Bounce, Money, Online } from './AllParts'
import { copy } from './allSitesCopy'
import { anyPayments, fromStart, type Layout } from './allSitesLogic'
import './AllRows.css'

type Props = { rows: SiteRow[]; layout: Layout; total: number; start: number; colorOf: (id: string) => string; brandOf: (id: string, domain: string) => Pick<Site, 'domain'> }

/** A site with no visit at all, then or now: nothing to count. */
const waiting = (r: SiteRow) => !r.visitors && !r.previous_visitors && !r.error

export function AllRows({ rows, layout, total, start, colorOf, brandOf }: Props) {
  const money = anyPayments(rows)
  const go = (r: SiteRow) => (waiting(r) ? openSettings(r, 'install') : navigate('/' + encodeURIComponent(r.domain)))
  const mark = (r: SiteRow) => <SiteMark site={{ ...brandOf(r.id, r.domain), color: colorOf(r.id) }} size={layout === 'cards' ? 32 : 24} />
  const name = (r: SiteRow) => (
    <b title={r.domain}>{r.name || r.domain}</b>
  )
  const share = (r: SiteRow) =>
    rows.length > 1 &&
    r.visitors > 0 && (
      <span className="all-share" title={copy.share(Math.round((total ? r.visitors / total : 0) * 100))}>
        <i style={{ width: `${Math.max((total ? r.visitors / total : 0) * 100, 2)}%`, background: colorOf(r.id) }} />
      </span>
    )
  const spark = (r: SiteRow, h: number) => <Spark values={fromStart(r.series, start)} color={colorOf(r.id)} h={h} />

  if (layout === 'cards')
    return (
      <div className="all-cards" role="list">
        {rows.map((r) => {
          const dv = r.visitors || r.previous_visitors ? delta(r.visitors, r.previous_visitors) : null
          return (
            <div key={r.id} role="listitem" className="all-item">
              <button type="button" className={'all-card' + (waiting(r) ? ' quiet' : '')} onClick={() => go(r)}>
                <span className="all-card-head">
                  {mark(r)}
                  {name(r)}
                  <Online r={r} />
                </span>
                {waiting(r) ? (
                  <span className="all-wait">
                    {copy.waiting} · <b>{copy.install}</b>
                  </span>
                ) : (
                  <>
                    {spark(r, 44)}
                    <span className="all-card-foot">
                      <span className="all-big">
                        {fmtInt(r.visitors)}
                        {dv && <span className={'delta tone-' + dv.tone}>{dv.text}</span>}
                        {share(r)}
                      </span>
                      <Bounce rate={r.bounce_rate} visitors={r.visitors} short />
                    </span>
                  </>
                )}
              </button>
              <OpenSite domain={r.domain} />
            </div>
          )
        })}
      </div>
    )

  return (
    <div className={'all-slim' + (money ? ' money' : '')} role="list">
      <div className="all-line all-cols" aria-hidden="true">
        <span>{copy.site}</span>
        <span />
        <span className="n">{copy.visitors}</span>
        <span className="n">{copy.bounce}</span>
        <span className="n">{copy.pageviews}</span>
        {money && <span className="n">{copy.revenue}</span>}
      </div>
      {rows.map((r) => (
        <div key={r.id} role="listitem" className="all-item">
          <button type="button" className={'all-line' + (waiting(r) ? ' quiet' : '')} onClick={() => go(r)}>
            <span className="all-line-name">
              {mark(r)}
              <span>
                {name(r)}
                <Online r={r} />
              </span>
            </span>
            {waiting(r) ? (
              <span className="all-wait">
                {copy.waiting} · <b>{copy.install}</b>
              </span>
            ) : (
              <>
                {spark(r, 28)}
                <span className="n all-big">
                  {fmtInt(r.visitors)}
                  {share(r)}
                </span>
                <span className="n">
                  <Bounce rate={r.bounce_rate} visitors={r.visitors} />
                </span>
                <span className="n">{fmtInt(r.pageviews)}</span>
                {money && (
                  <span className="n">
                    <Money r={r} />
                  </span>
                )}
              </>
            )}
          </button>
          <OpenSite domain={r.domain} />
        </div>
      ))}
    </div>
  )
}
