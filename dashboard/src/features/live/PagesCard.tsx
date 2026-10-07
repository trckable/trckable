// The pages people are on right now, the top three, each with a thin bar.
import { FileText } from 'lucide-react'
import { ListTable } from '../../kit'
import { truncateMiddle } from '../../lib/visitor'
import { cardsCopy as t } from './cardsCopy'
import type { Count } from './cardsModel'
import { openExplore, openFiltered } from './cardsOpen'

export function PagesCard({ pages }: { pages: Count[] }) {
  const top = pages[0]?.n ?? 1
  return (
    <ListTable
      stretch
      className="lv-card"
      icon={<FileText size={15} strokeWidth={1.8} />}
      title={t.pagesTitle}
      openLabel={t.open(t.pagesTitle)}
      onOpen={() => void openExplore()}
      bare
      rows={pages}
      rowKey={(p) => p.key}
      columns={[
        { key: 'page', head: t.pagesTitle, cell: (p) => <span className="kit-clip">{truncateMiddle(p.key, 34)}</span> },
        { key: 'n', head: '', cell: (p) => p.n, num: true },
      ]}
      pick={{ onPick: (p) => void openFiltered('page', p.key), label: (p) => t.openPage(p.key, p.n), title: (p) => p.key }}
      bar={(p) => (p.n / top) * 100}
    />
  )
}
