// The team's home: an extension of the main dashboard for every site. A summary strip (people now, today against usual, money,
// who needs a look), one briefing line, then the sites, the ones that need a look first. ?tv=a cards, ?tv=b dense table.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Loading } from '../../components/loading/Loading'
import { Segmented } from '../../kit'
import type { Site } from '../../lib/api'
import { fmtInt, fmtMoney } from '../../lib/format'
import { openAddSite } from '../../lib/account'
import { copy } from './copy'
import { sorted, tone, totals, type Sort, type TeamSite } from './model'
import { TeamCards } from './TeamCards'
import { TeamTable } from './TeamTable'
import { layoutOf, useTeam } from './useTeam'
import '../../mock/mock.css'
import '../../mock/theme.css'
import './team.css'

function pace(d: number): string {
  if (Math.abs(d) < 0.03) return copy.briefSteady
  return d > 0 ? copy.briefAbove(Math.round(d * 100)) : copy.briefBelow(Math.round(-d * 100))
}

function listOf(a: TeamSite[]): string {
  if (a.length === 1) return a[0].name
  if (a.length === 2) return `${a[0].name} and ${a[1].name}`
  return `${a[0].name}, ${a[1].name} and ${a.length - 2} more`
}

/** One line for the day across the sites: the pace, then who needs a look. */
function briefing(sites: TeamSite[]): string {
  const t = totals(sites)
  if (!sites.length) return copy.emptySub
  const parts: string[] = []
  if (t.usual && t.usual > 0) {
    const d = t.today / t.usual - 1
    parts.push(pace(d))
  } else parts.push(copy.briefToday(fmtInt(t.today)))
  const a = t.attention
  if (!a.length) parts.push(copy.briefAllFine)
  else {
    parts.push(copy.briefFlag(listOf(a), a.length > 1))
  }
  return parts.join(' ')
}

function Strip({ sites }: { sites: TeamSite[] }) {
  const t = totals(sites)
  const d = t.usual ? t.today / t.usual - 1 : null
  return (
    <div className="tm-strip">
      <div>
        <span className="tm-k">{copy.online}</span>
        <b className="num tm-big"><i className={'tm-dot' + (t.online ? ' on' : '')} aria-hidden="true" />{fmtInt(t.online)}</b>
      </div>
      <div>
        <span className="tm-k">{copy.today}</span>
        <b className="num tm-big">{fmtInt(t.today)}</b>
        {d !== null && <small className={tone(d)}>{(d >= 0 ? '↑ +' : '↓ −') + fmtInt(Math.abs(d) * 100) + '% ' + copy.vsUsual}</small>}
      </div>
      {t.revenue && (
        <div>
          <span className="tm-k">{copy.revenue}</span>
          <b className="num tm-big">{fmtMoney(t.revenue.minor, t.revenue.currency, t.revenue.exponent)}</b>
        </div>
      )}
      <div>
        <span className="tm-k">{copy.attention}</span>
        <b className={'num tm-big' + (t.attention.length ? ' warn' : '')}>{t.attention.length || copy.allFine}</b>
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="tm-empty">
      <h2>{copy.emptyTitle}</h2>
      <p className="muted">{copy.emptySub}</p>
      <button type="button" className="btn primary" onClick={openAddSite}>
        <Plus size={16} aria-hidden="true" />
        {copy.add}
      </button>
    </div>
  )
}

export function TeamHome({ sites, header }: { sites: Site[]; header: React.ReactNode }) {
  const { team, err } = useTeam(sites)
  const [by, setBy] = useState<Sort>('attention')
  const layout = layoutOf()
  const line = team ? briefing(team) : copy.reading
  const ready = team ? sorted(team, by) : null
  return (
    <>
      {header}
      <div className="mk-tokens mk-allsites">
        <main className="tm-page">
          <div className="tm-head">
            <div>
              <h1>{copy.title}</h1>
              <p className="muted">{line}</p>
            </div>
            {team && team.length > 1 && (
              <Segmented
                label={copy.sortLabel}
                value={by}
                onChange={setBy}
                options={(['attention', 'traffic', 'change'] as const).map((v) => ({ value: v, label: copy.sort[v] }))}
              />
            )}
          </div>
          {err && <p className="empty">{err}</p>}
          {!team && !err && <Loading height={320} />}
          {team && team.length === 0 && <Empty />}
          {ready && ready.length > 0 && (
            <>
              <Strip sites={ready} />
              {layout === 'a' ? <TeamCards sites={ready} onAdd={openAddSite} /> : <TeamTable sites={ready} />}
              {layout === 'b' && (
                <button type="button" className="tm-addline" onClick={openAddSite}>
                  <Plus size={16} aria-hidden="true" />
                  {copy.add}
                </button>
              )}
            </>
          )}
        </main>
      </div>
    </>
  )
}
