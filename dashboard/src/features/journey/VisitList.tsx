// The visits, newest first: the latest few as cards, the rest behind one "N earlier visits" row that opens in place.
import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { copy } from './copy'
import { splitVisits, type Identity, type VisitStory } from './model'
import type { OnFilter } from './SourceChip'
import { VisitCard } from './VisitCard'

export function VisitList({ visits, who, currency, zone, onFilter }: { visits: VisitStory[]; who: Identity; currency: string; zone: string; onFilter?: OnFilter }) {
  const [all, setAll] = useState(false)
  const { shown, folded } = splitVisits(visits)
  const list = all ? visits : shown
  return (
    <ol className="jr-visits" aria-label={copy.visitsLabel}>
      {list.map((v) => (
        <VisitCard key={v.key} v={v} who={who} currency={currency} zone={zone} onFilter={onFilter} />
      ))}
      {!all && folded.length > 0 && (
        <li className="jr-earlier">
          <button type="button" className="jr-fold" aria-expanded="false" onClick={() => setAll(true)}>
            <ChevronsUpDown size={13} strokeWidth={2} aria-hidden="true" />
            {copy.earlierVisits(folded.length)}
          </button>
        </li>
      )}
    </ol>
  )
}
