// The pages people are on right now, the top three, as the same bar rows as the Data lists.
import { FileText } from 'lucide-react'
import { BarList } from '../../charts/BarList'
import { Card } from '../../kit'
import { truncateMiddle } from '../../lib/visitor'
import { cardsCopy as t } from './cardsCopy'
import type { Count } from './cardsModel'
import { openExplore, openFiltered } from './cardsOpen'

export function PagesCard({ pages }: { pages: Count[] }) {
  return (
    <Card stretch className="lv-card" icon={<FileText size={15} strokeWidth={1.8} />} title={t.pagesTitle} openLabel={t.open(t.pagesTitle)} onOpen={() => void openExplore()}>
      <div className="lv-pages">
        <BarList
          bare
          dimLabel={t.pagesTitle}
          items={pages.map((p) => ({ key: p.key, label: truncateMiddle(p.key, 34), title: p.key, value: p.n }))}
          onPick={(key) => void openFiltered('page', key)}
          pickLabel={(key) => t.openPage(key, pages.find((p) => p.key === key)?.n ?? 0)}
        />
      </div>
    </Card>
  )
}
