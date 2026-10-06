// All sites' Online now card: the same number as the switcher's header.
import { useOnlineAll } from '../lib/allOnline'
import { fmtInt } from '../lib/format'
import { copy } from './allSitesCopy'

export function OnlineTile() {
  const online = useOnlineAll() ?? 0
  return (
    <div className="all-stat">
      <span className="all-stat-label">
        <span className={online > 0 ? 'pulse' : 'pulse off'} aria-hidden="true" />
        {copy.online}
      </span>
      <b className="num">{fmtInt(online)}</b>
      <span className="faint">{copy.onlineSub}</span>
    </div>
  )
}
