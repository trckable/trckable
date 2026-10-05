// All sites' Online now tile: the same number as the switcher's header.
import { useOnlineAll } from '../lib/allOnline'
import { fmtInt } from '../lib/format'

export function OnlineTile() {
  const online = useOnlineAll() ?? 0
  return (
    <div className="all-tile">
      <span className="faint">Online now</span>
      <b className="num">
        {online > 0 && <span className="pulse" aria-hidden="true" />} {fmtInt(online)}
      </b>
      <span className="faint">in the last 5 minutes</span>
    </div>
  )
}
