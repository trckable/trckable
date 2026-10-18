// All sites: the team's home. A strip (people now, today against usual, money, who needs a look), one line for the day, then a row for
// each site, the ones that need a look first. Every figure is read from the server; a figure it did not give is left out.
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Loading } from '../../components/loading/Loading'
import { Segmented } from '../../kit'
import type { Site } from '../../lib/api'
import { openAddSite } from '../../lib/account'
import { can } from '../../lib/permissions'
import { fmtInt, fmtMoney } from '../../lib/format'
import { useV2Extras } from '../../v2/slots'
import { briefing } from './briefing'
import { copy } from './copy'
import { sorted, teamSite, tone, totals, type Sort, type TeamSite } from './model'
import { TeamTable } from './TeamTable'
import { useTeam } from './useTeam'
import '../../mock/mock.css'
import '../../mock/theme.css'
import './team.css'

function Strip({ sites }: { sites: TeamSite[] }) {
  const t = totals(sites)
  const { teamStrip } = useV2Extras()
  const d = t.versus ? t.versus.today / t.versus.usual - 1 : null
  return (
    <div className="tm-strip">
      <div>
        <span className="tm-k">{copy.online}</span>
        <b className="num tm-big" data-k="online"><i className={'tm-dot' + (t.online ? ' on' : '')} aria-hidden="true" />{fmtInt(t.online)}</b>
      </div>
      <div>
        <span className="tm-k">{copy.today}</span>
        <b className="num tm-big" data-k="today">{fmtInt(t.today)}</b>
        {d !== null && <small className={tone(d)}>{(d >= 0 ? '↑ +' : '↓ −') + fmtInt(Math.abs(d) * 100) + '% ' + copy.vsUsual}</small>}
      </div>
      {t.revenue && (
        <div>
          <span className="tm-k">{copy.revenue}</span>
          <b className="num tm-big" data-k="revenue">{fmtMoney(t.revenue.minor, t.revenue.currency, t.revenue.exponent)}</b>
        </div>
      )}
      <div>
        <span className="tm-k">{copy.attention}</span>
        <b className={'num tm-big' + (t.attention.length ? ' warn' : '')} data-k="attention">{t.attention.length || copy.allFine}</b>
      </div>
      {teamStrip}
    </div>
  )
}

function Add({ className }: { className: string }) {
  const { addSiteGuard } = useV2Extras()
  if (!can('site.add')) return null
  const draw = (off: boolean) => (
    <button type="button" className={className} disabled={off} onClick={openAddSite}>
      <Plus size={16} aria-hidden="true" />
      {copy.add}
    </button>
  )
  return addSiteGuard ? addSiteGuard(draw) : draw(false)
}

function Empty() {
  return (
    <div className="tm-empty">
      <h2>{copy.emptyTitle}</h2>
      <p className="muted">{copy.emptySub}</p>
      <Add className="btn primary" />
    </div>
  )
}

export function TeamHome({ sites, header }: { sites: Site[]; header: React.ReactNode }) {
  const { rows, err } = useTeam()
  const [by, setBy] = useState<Sort>('attention')
  const team = useMemo(() => (rows || sites.length === 0 ? sites.map((s) => teamSite(s, rows?.find((r) => r.id === s.id))) : null), [rows, sites])
  const ready = team ? sorted(team, by) : null
  return (
    <>
      {header}
      <div className="mk-tokens mk-allsites">
        <main className="tm-page">
          <div className="tm-head">
            <div>
              <h1>{copy.title}</h1>
              <p className="muted" data-k="briefing">{team ? briefing(team) : copy.reading}</p>
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
              <TeamTable sites={ready} />
              <Add className="tm-addline" />
            </>
          )}
        </main>
      </div>
    </>
  )
}
