// A link's fixed period in words, the way the card says it: a preset by name, a range as its days, all time as "Since" its first day.
import { PRESETS, fmtDay, fmtRange, todayIn } from '../../lib/dates'
import { fixedDays } from '../../lib/sharePeriods'
import { copy } from './copy'

export function periodName(period: string, today = todayIn('UTC')): string {
  const preset = PRESETS.find((p) => p.id === period)
  if (preset) return preset.label
  const days = fixedDays(period, today)
  if (!days) return period
  return period.startsWith('since:') ? copy.periodSince(fmtDay(days.from, { year: true })) : fmtRange(days, today)
}
