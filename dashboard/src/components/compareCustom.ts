// A custom comparison starts on the period just before, for the calendar to
// move (the comparison menu and the period's popover both begin it).
import { compareRange } from '../lib/dates'
import type { PickerValue } from './DatePicker'

export function withCustom(v: PickerValue): PickerValue {
  if (v.compare !== 'custom' || v.compareCustom) return v
  return { ...v, compareCustom: compareRange(v.range, 'previous', undefined, v.period) ?? undefined }
}
