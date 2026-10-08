// The top of the switcher: All sites as a small chip, and once the numbers
// are here, how many are online now and today's visitors over every site.
import { LayoutGrid } from 'lucide-react'
import { useOnlineAll } from '../../lib/allOnline'
import { fmtCompact } from '../../lib/format'
import { copy } from './menuCopy'
import { totalOf, type Today } from './useToday'

export function AllStrip({ on, numbers, onPick }: { on: boolean; numbers: Map<string, Today> | null; onPick: () => void }) {
  const online = useOnlineAll()
  const sum = numbers && totalOf(numbers)
  return (
    <div className="sites-strip">
      <button type="button" data-stop aria-current={on ? 'page' : undefined} className={on ? 'all-chip on' : 'all-chip'} onClick={onPick}>
        <LayoutGrid size={13} strokeWidth={1.75} aria-hidden="true" />
        {copy.all}
      </button>
      {sum && (
        <span className="strip-sum">
          <span title={copy.onlineAll}>
            <i className={online ? 'live-dot on' : 'live-dot'} aria-hidden="true" />
            {fmtCompact(online ?? 0)} <i>{copy.liveShort}</i>
          </span>
          <span title={copy.todayAll}>
            {fmtCompact(sum.visitors)} <i>{copy.todayShort}</i>
          </span>
        </span>
      )}
    </div>
  )
}
