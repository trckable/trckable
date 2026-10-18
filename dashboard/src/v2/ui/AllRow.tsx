// "All sites" at the top of the site list, with the visitors of today over the sites listed (the row is only its name until the numbers are here).
import { LayoutGrid } from 'lucide-react'
import { fmtCompact } from '../../lib/format'
import { copy as menu } from '../../features/sites/menuCopy'

export function AllRow({ on, total, all, onPick }: { on: boolean; total: number | null; all: string; onPick: () => void }) {
  return (
    <button type="button" data-stop className={`mi all${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={onPick}>
      <LayoutGrid size={14} strokeWidth={1.75} aria-hidden="true" />
      <span className="mt2">
        <div className="nm">{all}</div>
      </span>
      {total !== null && (
        <span className="now" title={menu.todayAll}>
          <b>{fmtCompact(total)}</b>
        </span>
      )}
    </button>
  )
}
