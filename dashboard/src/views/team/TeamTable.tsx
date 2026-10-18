// One dense row for each site, with its trend. A phone keeps the site, its trend and today.
import { fmtInt } from '../../lib/format'
import { useV2Extras } from '../../v2/slots'
import { copy } from './copy'
import type { TeamSite } from './model'
import { Change, Live, mark, money, openSite, SiteMenu, Status, Trend } from './TeamParts'

export function TeamTable({ sites }: { sites: TeamSite[] }) {
  const c = copy.columns
  const { siteStatus } = useV2Extras()
  const paid = sites.some((s) => money(s))
  return (
    <div className={'tm-table' + (paid ? ' paid' : '')} role="table" aria-label={copy.title}>
      <div className="tm-row tm-headrow" role="row">
        <span role="columnheader">{c.site}</span>
        <span role="columnheader" className="c-now">{c.online}</span>
        <span role="columnheader" className="c-trend">{c.trend}</span>
        <span role="columnheader" className="c-n">{c.today}</span>
        <span role="columnheader" className="c-chg">{c.change}</span>
        <span role="columnheader" className="c-src">{c.source}</span>
        {paid && <span role="columnheader" className="c-rev c-n">{c.revenue}</span>}
        <span />
      </div>
      {sites.map((s) => (
        <div key={s.id} className={'tm-row ' + s.state} role="row" data-site={s.id}>
          <span role="cell">
            <button type="button" className="tm-name" onClick={() => openSite(s)}>
              {mark(s)}
              <span>
                <i className="tm-nm">{s.name}</i>
                <Status s={s} />
                {siteStatus?.(s.id)}
              </span>
            </button>
          </span>
          <span role="cell" className="c-now"><Live s={s} /></span>
          <span role="cell" className="c-trend" aria-label={copy.trend(s.name)}><Trend s={s} /></span>
          <span role="cell" className="c-n num">
            {s.day && <b>{fmtInt(s.day.today)}</b>}
            <Change s={s} />
          </span>
          <span role="cell" className="c-chg"><Change s={s} /></span>
          <span role="cell" className="c-src">{s.day?.topSource}</span>
          {paid && <span role="cell" className="c-rev c-n num">{money(s)}</span>}
          <span role="cell"><SiteMenu s={s} /></span>
        </div>
      ))}
    </div>
  )
}
