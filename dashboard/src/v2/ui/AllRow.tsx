// "All sites" at the top of the site list: how many are online now and today's visitors over every site, once the numbers
// are here (the row is only its name until then).
import { LayoutGrid } from 'lucide-react'
import { useOnlineAll } from '../../lib/allOnline'
import { fmtCompact } from '../../lib/format'
import { copy as menu } from '../../features/sites/menuCopy'
import { totalOf, type Today } from '../../features/sites/useToday'
import { copy } from '../copy'

export function AllRow({ on, numbers, all, slim, onPick }: { slim?: boolean; on: boolean; numbers: Map<string, Today> | null; all: string; onPick: () => void }) {
  const online = useOnlineAll()
  const sum = numbers && totalOf(numbers)
  return (
    <button type="button" data-stop className={`mi all${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={onPick}>
      <LayoutGrid size={14} strokeWidth={1.75} aria-hidden="true" />
      <span className="mt2">
        <div className="nm">{all}</div>
        {!slim && <div className="d">{copy.overview}</div>}
      </span>
      {sum && slim && (
        <span className="now" title={menu.todayAll}>
          <b>{fmtCompact(sum.visitors)}</b>
        </span>
      )}
      {sum && !slim && (
        <span className="now strip-sum" title={`${menu.onlineAll} · ${menu.todayAll}`}>
          <b>{fmtCompact(online ?? 0)}</b> {copy.nowWord} · <b>{fmtCompact(sum.visitors)}</b> {menu.todayShort}
        </span>
      )}
    </button>
  )
}
