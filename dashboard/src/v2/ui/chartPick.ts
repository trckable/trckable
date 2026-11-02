// What picking a period writes.
import type { ViewState } from '../../lib/url'

/** What picking a period writes: it clears the dates, the cut and the day the page was on. The header's menu writes the same. */
export const periodPatch = (id: string): Partial<ViewState> => ({ period: id, from: undefined, to: undefined, bucket: undefined, day: undefined })
