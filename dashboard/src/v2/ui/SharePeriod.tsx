// The period on a shared link: a small switch of the few periods the link offers (lib/sharePeriods.json), in place of the
// period menu. No dates, no comparison. A link that offers one period shows no switch at all.
import { presetById } from '../../lib/dates'
import { SHARE_PERIODS } from '../../lib/sharePeriods'
import { copy } from './sharePeriodCopy'
import { SegmentedSwitch } from './SegmentedSwitch'

export function SharePeriod({ value, onPick, offered = SHARE_PERIODS }: { value: string; onPick: (id: string) => void; offered?: string[] }) {
  if (offered.length < 2) return null
  const items = offered.map((id) => ({ value: id, label: copy.short[id] ?? id, title: presetById(id)?.label }))
  return (
    <div className="share-period">
      <SegmentedSwitch id="share-period" label={copy.label} value={value} onChange={onPick} items={items} />
    </div>
  )
}
