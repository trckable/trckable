// All sites' Online now card: the same number as the switcher's header.
import { Radio } from 'lucide-react'
import { CountUp } from '../kit/CountUp'
import { MetricArea } from '../kit/MetricArea'
import { useOnlineAll, useOnlineMinutes } from '../lib/allOnline'
import { fmtInt } from '../lib/format'
import { copy } from './allSitesCopy'

export function OnlineTile() {
  const online = useOnlineAll() ?? 0
  const minutes = useOnlineMinutes()
  const live = (
    <span className={online > 0 ? 'all-online' : 'all-online none'}>
      <span className={online > 0 ? 'pulse' : 'pulse off'} aria-hidden="true" />
      {copy.live}
    </span>
  )
  return <MetricArea icon={<Radio size={15} strokeWidth={1.8} />} label={copy.online} aside={live} value={<CountUp value={online} format={fmtInt} />} status={copy.onlineSub} series={minutes} tone="neutral" />
}
