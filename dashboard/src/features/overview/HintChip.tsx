// What the Visitors tile adds under its number: for today or yesterday, how it
// compares with that weekday's usual (the server averages the last four, to
// the same time of day); for this month, where it is heading. Its own chunk:
// the slot is kept in the tile, so nothing moves when this arrives.
import { useEffect, useState } from 'react'
import { call, rangeQS, type Filter } from '../../lib/api'
import { hourIn } from './firstVisit'
import { projectionChip, usualChip, type Chip, type Usual } from './hint'

export interface HintProps {
  site: string
  timezone: string
  /** The period's name: today, yesterday or mtd (this month). */
  period: string
  /** The day today and yesterday are about. */
  day: string
  filters: Filter[]
  visitors?: number
  /** The first day with visitors in this month's chart. */
  since?: string
}

/** Today so far changes by the minute, but what is usual does not: asked again once a minute. */
const AGAIN_MS = 60_000

function useUsual(p: HintProps): Usual | null {
  const [got, setGot] = useState<{ key: string; usual: Usual } | null>(null)
  const filters = JSON.stringify(p.filters)
  const on = p.period === 'today' || p.period === 'yesterday'
  const key = `${p.site}|${p.day}|${filters}`
  useEffect(() => {
    if (!on) return
    const ask = () =>
      call<Usual>('GET', `/sites/${encodeURIComponent(p.site)}/usual` + rangeQS({ from: p.day, to: p.day, filters: p.filters }), undefined, undefined, true)
        .then((usual) => setGot({ key, usual }))
        .catch(() => {})
    void ask()
    const t = setInterval(() => document.visibilityState === 'visible' && void ask(), AGAIN_MS)
    return () => clearInterval(t)
  }, [on, key, p.site, p.day, p.filters])
  return got && got.key === key ? got.usual : null
}

export default function HintChip(p: HintProps) {
  const usual = useUsual(p)
  let chip: Chip | null = null
  if (p.period === 'mtd' && p.visitors !== undefined) chip = projectionChip(p.visitors, hourIn(p.timezone), p.since)
  else if (usual) chip = usualChip(usual, p.day, p.period === 'today')
  if (!chip) return null
  return (
    <span className={'kpi-chip tone-' + chip.tone} title={chip.title}>
      {chip.text}
    </span>
  )
}
