// All sites: the team's home. A strip (people now, today against usual, money, who needs a look), one line for the day, then a row for
// each site, the ones that need a look first. Every figure is read from the server; a figure it did not give is left out.
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Loading } from '../../components/loading/Loading'
import { Segmented } from '../../kit'
import type { Site } from '../../lib/api'
import { ChannelsSection } from '../../features/channels/ChannelsSection'
import { openAddSite } from '../../lib/account'
import { can } from '../../lib/permissions'
import { fmtInt, fmtMoney } from '../../lib/format'
import { useV2Extras } from '../../v2/slots'
import { SummaryCards, type SumItem } from '../../v2/ui/SummaryCards'
import { briefing } from './briefing'
import { copy } from './copy'
import { sorted, sumTone, teamSite, tone, totals, type Sort, type TeamSite } from './model'
import { TeamTable } from './TeamTable'
import { useTeam } from './useTeam'
import '../../mock/mock.css'
import '../../kit/layout.css'
import '../../mock/theme.css'
import './team.css'

function Strip({ sites }: { sites: TeamSite[] }) {
  const t = totals(sites)
  const { teamStrip } = useV2Extras()
  const d = t.versus ? t.versus.today / t.versus.usual - 1 : null
  const items: SumItem[] = [
    { key: 'online', data: 'online', label: copy.online, val: fmtInt(t.online), flag: <i className={'tm-dot' + (t.online ? ' on' : '')} aria-hidden="true" /> },
    { key: 'today', data: 'today', label: copy.today, val: fmtInt(t.today), ...(d !== null && { tag: (d >= 0 ? '+' : '−') + fmtInt(Math.abs(d) * 100) + '%', tone: sumTone(tone(d)), sub: copy.vsUsual }) },
    ...(t.revenue ? [{ key: 'revenue', data: 'revenue', label: copy.revenue, val: fmtMoney(t.revenue.minor, t.revenue.currency, t.revenue.exponent) }] : []),
    { key: 'attention', data: 'attention', label: copy.attention, val: String(t.attention.length || copy.allFine) },
  ]
  return (
    <div className="mk mk-body">
      <SummaryCards items={items} />
      {teamStrip}
    </div>
  )
}

function Add({ className }: { className: string }) {
  const { addSiteGuard } = useV2Extras()
  if (!can('site.add')) return null
  const draw = (off: boolean) => (
    <button type="button" className={className} disabled={off} onClick={() => openAddSite()}>
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
            <div className="tm-acts">
              {team && team.length > 1 && (
                <Segmented
                  label={copy.sortLabel}
                  value={by}
                  onChange={setBy}
                  options={(['attention', 'traffic', 'change'] as const).map((v) => ({ value: v, label: copy.sort[v] }))}
                />
              )}
              <Add className="btn small" />
            </div>
          </div>
          {err && <p className="empty">{err}</p>}
          {!team && !err && <Loading height={320} />}
          {team && team.length === 0 && <Empty />}
          {ready && ready.length > 0 && (
            <>
              <Strip sites={ready} />
              <TeamTable sites={ready} />
              <ChannelsSection />
            </>
          )}
        </main>
      </div>
    </>
  )
}
