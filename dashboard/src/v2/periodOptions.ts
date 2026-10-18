// The periods the header's menu offers, said as it says them: five up front, the rest under More. The Briefing and the
// pages that carry their own period (the incident history) read the same list.
import { PRESETS, type ISODate } from '../lib/dates'
import { rangeWords } from './dayWords'
import { copy } from './copy'
import type { PeriodOption } from './ui/PeriodChip'

const FIRST = ['today', 'yesterday', '7d', '30d', '90d']
const MORE = ['12mo', 'wtd', 'mtd', 'lastmonth', 'ytd']

export function periodOptions(today: ISODate): { options: PeriodOption[]; more: PeriodOption[] } {
  const preset = (id: string) => {
    const x = PRESETS.find((q) => q.id === id)
    return x ? { id, name: id === 'today' ? copy.today : x.label, d: rangeWords(x.range(today), today, copy.todayWord) } : null
  }
  return { options: FIRST.flatMap((id) => preset(id) ?? []), more: MORE.flatMap((id) => preset(id) ?? []) }
}
