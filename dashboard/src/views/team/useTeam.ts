// The team's sites for the overview: from the dev fixture (?fixture=team), or from the account's own numbers. A number the server
// does not have is left out, never filled in.
import { useEffect, useState } from 'react'
import type { Site, SiteRow } from '../../lib/api'
import { siteColor } from '../../components/SiteMark'
import { statusOf } from '../../features/sitestatus/status'
import { useOverview } from '../useOverview'
import type { TeamSite } from './model'

const KEY = 'trckable:teamfx'

/** Dev only: ?fixture=team (kept for the tab) answers with the eight-site team. */
function fixtureOn(): boolean {
  if (!import.meta.env.DEV) return false
  const ask = new URLSearchParams(location.search).get('fixture')
  try {
    if (ask) sessionStorage.setItem(KEY, ask === 'team' ? '1' : '')
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return ask === 'team'
  }
}

function fromRow(r: SiteRow, site: Site | undefined): TeamSite {
  const s = r.series ?? []
  const before = s.slice(0, -1)
  return {
    id: r.id,
    name: r.name,
    color: site ? siteColor(site) : 'var(--text-3)',
    status: site ? statusOf(site) : 'ok',
    online: r.online,
    today: s.length ? s[s.length - 1] : 0,
    usual: before.length >= 7 && before.some((v) => v > 0) ? before.reduce((a, b) => a + b, 0) / before.length : undefined,
    series: s.length ? s : undefined,
    currency: r.currency,
    exponent: r.exponent,
  }
}

export function useTeam(sites: Site[]): { team: TeamSite[] | null; err: string } {
  const fx = fixtureOn()
  const [fixed, setFixed] = useState<TeamSite[] | null>(null)
  useEffect(() => {
    if (!fx) return
    void import('../../dev/fixture/team').then((m) => setFixed(m.teamFixture))
  }, [fx])
  const { rows, err } = useOverview(14)
  if (fx) return { team: fixed, err: '' }
  return { team: rows ? rows.map((r) => fromRow(r, sites.find((s) => s.id === r.id))) : null, err }
}

/** ?tv=a (cards) or b (table); kept for the tab in a development build. */
export function layoutOf(): 'a' | 'b' {
  const ask = new URLSearchParams(location.search).get('tv')
  try {
    if (ask === 'a' || ask === 'b') sessionStorage.setItem('trckable:tv', ask)
    const kept = sessionStorage.getItem('trckable:tv')
    return ask === 'b' || (!ask && kept === 'b') ? 'b' : 'a'
  } catch {
    return ask === 'b' ? 'b' : 'a'
  }
}
