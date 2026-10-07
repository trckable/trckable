// The pages people are on right now, the top three, each with a thin bar.
import { FileText } from 'lucide-react'
import { truncateMiddle } from '../../lib/visitor'
import { cardsCopy as t } from './cardsCopy'
import type { Count } from './cardsModel'
import { openExplore, openFiltered } from './cardsOpen'
import { LiveCard } from './LiveCard'

export function PagesCard({ pages }: { pages: Count[] }) {
  const top = pages[0]?.n ?? 1
  return (
    <LiveCard title={t.pagesTitle} icon={<FileText size={15} strokeWidth={1.8} aria-hidden="true" />} onOpen={() => void openExplore()}>
      <ul className="lv-list">
        {pages.map((p) => (
          <li key={p.key}>
            <button type="button" className="lv-row" onClick={() => void openFiltered('page', p.key)} aria-label={t.openPage(p.key, p.n)} title={p.key}>
              <span className="lv-label num">{truncateMiddle(p.key, 34)}</span>
              <span className="lv-count num">{p.n}</span>
              <span className="lv-bar" aria-hidden="true">
                <i style={{ width: `${(p.n / top) * 100}%` }} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </LiveCard>
  )
}
