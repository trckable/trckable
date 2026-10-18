// Direction A: a card for each site, the ones that need a look first.
import { Plus } from 'lucide-react'
import { fmtInt } from '../../lib/format'
import { navigate } from '../../lib/url'
import { copy } from './copy'
import type { TeamSite } from './model'
import { Change, Live, mark, money, SiteMenu, Status, Trend } from './TeamParts'

function Card({ s }: { s: TeamSite }) {
  const open = () => navigate('/' + encodeURIComponent(s.name))
  const rev = money(s)
  return (
    <article className={'tm-card ' + s.status}>
      <header>
        <button type="button" className="tm-name" onClick={open}>
          {mark(s)}
          <span>{s.name}</span>
        </button>
        <SiteMenu s={s} />
      </header>
      <div className="tm-figure">
        <b className="num">{fmtInt(s.today)}</b>
        <Change s={s} />
        {s.status === 'ok' || s.status === 'quiet' ? <Live s={s} /> : <Status s={s} />}
      </div>
      {s.status === 'quiet' && <Status s={s} />}
      <Trend s={s} h={44} />
      {(s.topSource || rev) && (
        <footer>
          <span>{s.topSource}</span>
          {rev && <span className="tm-rev">{rev}</span>}
        </footer>
      )}
    </article>
  )
}

export function TeamCards({ sites, onAdd }: { sites: TeamSite[]; onAdd: () => void }) {
  return (
    <div className="tm-grid">
      {sites.map((s) => (
        <Card key={s.id} s={s} />
      ))}
      <button type="button" className="tm-card tm-add" onClick={onAdd}>
        <Plus size={20} aria-hidden="true" />
        <b>{copy.add}</b>
        <span>{copy.addSub}</span>
      </button>
    </div>
  )
}
