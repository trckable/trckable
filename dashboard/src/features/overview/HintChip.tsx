// What the Visitors tile adds after its change: for today or yesterday, how it
// compares with that weekday's usual (the server averages the last four, to the
// same time of day). Its own chunk; the chip sits on the change's own line, so
// nothing moves when it arrives.
import { useEffect, useState } from 'react'
import { call, rangeQS, type Filter } from '../../lib/api'
import { SETTLE_MS } from '../../lib/settle'
import { usualChip, type Usual } from './hint'

export interface HintProps {
  site: string
  /** The period's name: today or yesterday. */
  period: string
  /** The day today and yesterday are about. */
  day: string
  filters: Filter[]
}

/** Today so far changes by the minute, but what is usual does not: asked again once a minute. */
const AGAIN_MS = 60_000

function useUsual(p: HintProps): Usual | null {
  const [got, setGot] = useState<{ key: string; usual: Usual } | null>(null)
  const filters = JSON.stringify(p.filters)
  const key = `${p.site}|${p.day}|${filters}`
  useEffect(() => {
    const ask = () =>
      call<Usual>('GET', `/sites/${encodeURIComponent(p.site)}/usual` + rangeQS({ from: p.day, to: p.day, filters: p.filters }), undefined, undefined, true)
        .then((usual) => setGot({ key, usual }))
        .catch(() => {})
    // After the page has had its moment, then once a minute.
    const first = setTimeout(() => void ask(), SETTLE_MS)
    const t = setInterval(() => document.visibilityState === 'visible' && void ask(), AGAIN_MS)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [key, p.site, p.day, p.filters])
  return got && got.key === key ? got.usual : null
}

export default function HintChip(p: HintProps) {
  const usual = useUsual(p)
  const chip = usual ? usualChip(usual, p.day, p.period === 'today') : null
  if (!chip) return null
  return (
    <span className={'kpi-chip tone-' + chip.tone} title={chip.title}>
      {chip.text}
    </span>
  )
}
