// All sites' Online now card: the same number as the switcher's header.
import { Radio } from 'lucide-react'
import { MetricArea } from '../kit/MetricArea'
import { useOnlineAll } from '../lib/allOnline'
import { fmtInt } from '../lib/format'
import { copy } from './allSitesCopy'

export function OnlineTile() {
  const online = useOnlineAll() ?? 0
  const live = (
    <span className={online > 0 ? 'all-online' : 'all-online none'}>
      <span className={online > 0 ? 'pulse' : 'pulse off'} aria-hidden="true" />
      {copy.live}
    </span>
  )
  return <MetricArea icon={<Radio size={15} strokeWidth={1.8} />} label={copy.online} aside={live} value={fmtInt(online)} status={copy.onlineSub} />
}
