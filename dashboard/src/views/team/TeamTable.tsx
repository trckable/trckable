// Direction B: one dense row for each site, with its trend; a phone keeps the site, its number and its line.
import { fmtInt } from '../../lib/format'
import { navigate } from '../../lib/url'
import { copy } from './copy'
import type { TeamSite } from './model'
import { Change, Live, mark, money, SiteMenu, Status, Trend } from './TeamParts'

export function TeamTable({ sites }: { sites: TeamSite[] }) {
  const c = copy.columns
  const any = sites.some((s) => money(s))
  return (
    <div className={'tm-table' + (any ? ' paid' : '')} role="table">
      <div className="tm-row tm-headrow" role="row">
        <span role="columnheader">{c.site}</span>
        <span role="columnheader" className="c-now">{c.online}</span>
        <span role="columnheader" className="c-trend">{c.trend}</span>
        <span role="columnheader" className="c-n">{c.today}</span>
        <span role="columnheader" className="c-chg">{c.change}</span>
        <span role="columnheader" className="c-src">{c.source}</span>
        {any && <span role="columnheader" className="c-rev c-n">{c.revenue}</span>}
        <span />
      </div>
      {sites.map((s) => (
        <div key={s.id} className={'tm-row ' + s.status} role="row">
          <button type="button" className="tm-name" onClick={() => navigate('/' + encodeURIComponent(s.name))}>
            {mark(s)}
            <span>
              {s.name}
              <Status s={s} />
            </span>
          </button>
          <span className="c-now">{s.status === 'ok' || s.status === 'quiet' ? <Live s={s} /> : null}</span>
          <span className="c-trend"><Trend s={s} h={28} /></span>
          <span className="c-n num"><b>{fmtInt(s.today)}</b> <Change s={s} /></span>
          <span className="c-chg"><Change s={s} /></span>
          <span className="c-src">{s.topSource}</span>
          {any && <span className="c-rev c-n num">{money(s)}</span>}
          <SiteMenu s={s} />
        </div>
      ))}
    </div>
  )
}
