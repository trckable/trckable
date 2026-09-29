// Whether the period's popover is open. One store, so the phone's sheet can
// hand over to the date-range picker (More, Compare) without owning it.
import { miniStore } from '../lib/miniStore'

const open = miniStore(false)
export const setPeriodOpen = open.set
export const usePeriodOpen = open.use
