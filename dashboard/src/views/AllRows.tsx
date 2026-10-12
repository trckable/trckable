// The sites of All sites, in one of two layouts: cards for a few sites, a
// slim list for many. Either way the whole row is the link to the site.
import { useState } from 'react'
import { fmtInt } from '../lib/format'
import type { SiteRow } from '../lib/api'
import type { Site } from '../lib/api'
import { lazyLoad } from '../lib/lazyLoad'
import { navigate } from '../lib/url'
import { openSettings } from '../lib/settings'
import { SiteMark } from '../components/SiteMark'
import { OpenSite, openSiteTab } from '../features/sites/OpenSite'
import { Spark } from './AllSitesSpark'
import { MetricArea } from '../kit/MetricArea'
import { Bounce, bouncePill, Money, Online } from './AllParts'
import { copy } from './allSitesCopy'
import { anyPayments, bounceHigh, fromStart, type Layout } from './allSitesLogic'
import './AllRows.css'

type Props = { rows: SiteRow[]; layout: Layout; days: number; total: number; start: number; colorOf: (id: string) => string; brandOf: (id: string, domain: string) => Pick<Site, 'domain'> }

const BounceGuideModal = lazyLoad(() => import('../features/bounce/BounceGuideModal'))

/** A site with no visit at all, then or now: nothing to count. */
const waiting = (r: SiteRow) => !r.visitors && !r.previous_visitors && !r.error

/** Shift + Enter on a row opens the site's own address, as in the switcher. */
export function openOnShiftEnter(e: Pick<React.KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>, domain: string) {
  if (!e.shiftKey || e.key !== 'Enter' || !domain) return
  e.preventDefault()
  openSiteTab(domain)
}

export function AllRows({ rows, layout, days, total, start, colorOf, brandOf }: Props) {
  const money = anyPayments(rows)
  const [guide, setGuide] = useState<SiteRow | null>(null)
  const go = (r: SiteRow) => (waiting(r) ? openSettings(r, 'install') : navigate('/' + encodeURIComponent(r.domain)))
  // The amber bounce chip is a button of its own: a press on it opens the guide, a press anywhere else opens the site.
  const press = (r: SiteRow, e?: Pick<React.MouseEvent, 'target'>) => ((e?.target as Element | undefined)?.closest?.('[data-bounce-guide]') ? setGuide(r) : go(r))
  // The same, for a keyboard: the chip is inside the row's button, so it gets a button beside it.
  const guideKey = (r: SiteRow) =>
    bounceHigh(r.bounce_rate, r.visitors) && (
      <button type="button" className="all-guide-key" aria-haspopup="dialog" onClick={() => setGuide(r)}>
        {copy.seeWhy(r.name || r.domain)}
      </button>
    )
  const modal = guide && (
    <BounceGuideModal site={guide.id} domain={guide.domain} qs={`?days=${days}`} onClose={() => setGuide(null)} />
  )
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
        {modal}
        {rows.map((r) => {
          return (
            <div key={r.id} role="listitem" className="all-item">
              {waiting(r) ? (
                <button type="button" className="all-card quiet" onClick={() => go(r)} onKeyDown={(e) => openOnShiftEnter(e, r.domain)}>
                  <span className="all-card-head">
                    {mark(r)}
                    {name(r)}
                    <Online r={r} />
                  </span>
                  <span className="all-wait">
                    {copy.waiting} · <b>{copy.install}</b>
                  </span>
                </button>
              ) : (
                <MetricArea
                  compact
                  head={
                    <>
                      {mark(r)}
                      {name(r)}
                    </>
                  }
                  aside={<Online r={r} />}
                  value={fmtInt(r.visitors)}
                  pill={bouncePill(r.bounce_rate, r.visitors)}
                  series={fromStart(r.series, start)}
                  color={colorOf(r.id)}
                  press={(e?: React.MouseEvent) => press(r, e)}
                  onKeyDown={(e) => openOnShiftEnter(e, r.domain)}
                />
              )}
              {guideKey(r)}
              <OpenSite domain={r.domain} />
            </div>
          )
        })}
      </div>
    )

  return (
    <div className={'all-slim' + (money ? ' money' : '')} role="list">
      {modal}
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
          <button type="button" className={'all-line' + (waiting(r) ? ' quiet' : '')} onClick={(e) => press(r, e)} onKeyDown={(e) => openOnShiftEnter(e, r.domain)}>
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
          {guideKey(r)}
          <OpenSite domain={r.domain} />
        </div>
      ))}
    </div>
  )
}
