// Who came → Highlights: up to four lines about what changed against the
// period before, each a button that applies its filter. The tab exists only
// while the server has something to say (useInsights), so it is never filler.
import { CircleDollarSign, Sparkles, TrendingDown, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReportQuery } from '../../lib/api'
import { extrasApi, type Insight } from './extrasApi'
import { extrasCopy } from './copy'
import { highlightRows, type Tone } from './highlightModel'
import './extras.css'

const ICON: Record<Tone, LucideIcon> = { up: TrendingUp, down: TrendingDown, money: CircleDollarSign, warn: TriangleAlert, new: Sparkles }

/** What the server found for the period; null until it answers, and empty for a quiet site. */
export function useInsights(site: string, query: ReportQuery, on: boolean): Insight[] | null {
  const [found, setFound] = useState<{ key: string; list: Insight[] } | null>(null)
  const key = `${site}|${query.from}|${query.to}`
  useEffect(() => {
    if (!on) return
    let live = true
    extrasApi
      .insights(site, query)
      .then((d) => live && setFound({ key, list: d.insights }))
      .catch(() => live && setFound({ key, list: [] }))
    return () => {
      live = false
    }
  }, [key, on]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content: query is a new object each render
  return found && found.key === key ? found.list : null
}

export default function Highlights({ list, money, onPick }: { list: Insight[]; money: (minor: number) => string; onPick: (dim: string, value: string) => void }) {
  const rows = highlightRows(list, money)
  return (
    <ul className="hl" aria-label={extrasCopy.highlights.label}>
      {rows.map((r) => {
        const Icon = ICON[r.tone]
        return (
          <li key={r.key}>
            <button type="button" className={`hl-row ${r.tone}`} aria-label={`${r.text}. ${extrasCopy.highlights.filter(r.value || r.dim)}`} onClick={() => onPick(r.dim, r.value)}>
              <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
              <span className="num">{r.text}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
