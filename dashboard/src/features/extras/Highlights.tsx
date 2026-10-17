// Who came → Highlights: up to four lines about what changed against the
// period before, each a button that applies its filter. The tab exists only
// while the server has something to say (useInsights), so it is never filler.
import { CircleDollarSign, Sparkles, TrendingDown, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Insight } from './extrasApi'
import { extrasCopy } from './copy'
import { highlightRows, type Tone } from './highlightModel'
import './extras.css'

const ICON: Record<Tone, LucideIcon> = { up: TrendingUp, down: TrendingDown, money: CircleDollarSign, warn: TriangleAlert, new: Sparkles }

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
